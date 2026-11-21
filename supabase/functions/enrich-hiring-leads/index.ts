import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ALLOWED_TABLES = new Set([
  "us_sales_hiring_leads",
  "au_hiring_signal_leads",
]);

interface RawEnrichEntry {
  concat?: unknown;
  poc_name?: unknown;
  company?: unknown;
  email?: unknown;
}

interface ParsedEnrichEntry {
  index: number;
  poc_name: string;
  company: string;
  email: string | null;
  enrichment_id: 1 | 2;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function asNonEmptyString(val: unknown): string | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(val: unknown): string | null {
  const s = asNonEmptyString(val);
  if (!s) return null;
  if (s.toLowerCase() === "null" || s.toLowerCase() === "n/a") return null;
  return s.toLowerCase();
}

function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function parseEntry(
  raw: unknown,
  index: number,
): { entry?: ParsedEnrichEntry; error?: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "Item must be a JSON object." };
  }
  const obj = raw as RawEnrichEntry;

  let pocName = asNonEmptyString(obj.poc_name);
  let company = asNonEmptyString(obj.company);

  if (!pocName || !company) {
    const concat = asNonEmptyString(obj.concat);
    if (!concat) {
      return {
        error: "Missing 'concat' (expected 'POC Name, Company Name') or explicit 'poc_name' and 'company'.",
      };
    }
    // Split on FIRST comma only so company names containing commas (e.g. "..., IL, TX") stay intact
    const firstComma = concat.indexOf(",");
    if (firstComma === -1) {
      return {
        error: `Could not split 'concat' on comma: "${concat}"`,
      };
    }
    pocName = concat.slice(0, firstComma).trim();
    company = concat.slice(firstComma + 1).trim();
  }

  if (!pocName || !company) {
    return {
      error: "Parsed 'poc_name' or 'company' was empty.",
    };
  }

  const email = normalizeEmail(obj.email);
  const enrichment_id: 1 | 2 = email !== null ? 1 : 2;

  return {
    entry: {
      index,
      poc_name: pocName,
      company,
      email,
      enrichment_id,
    },
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method === "GET") {
    return jsonResponse({
      ok: true,
      function: "enrich-hiring-leads",
      default_table: "us_sales_hiring_leads",
      allowed_tables: Array.from(ALLOWED_TABLES),
      usage:
        "POST either a raw JSON array of { concat, email } items or { table?, dryRun?, leads: [...] }.",
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed. Use GET or POST." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY runtime env." },
        500,
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: "Request body must be valid JSON." }, 400);
    }

    let table = "us_sales_hiring_leads";
    let dryRun = false;
    let rawItems: unknown[];

    if (Array.isArray(rawBody)) {
      rawItems = rawBody;
    } else if (rawBody && typeof rawBody === "object") {
      const obj = rawBody as Record<string, unknown>;
      if (typeof obj.table === "string" && obj.table.trim()) {
        table = obj.table.trim();
      }
      dryRun = Boolean(obj.dryRun ?? obj.dry_run);
      const list = obj.leads ?? obj.items ?? obj.records;
      if (!Array.isArray(list)) {
        return jsonResponse(
          {
            ok: false,
            error: "Expected a JSON array or an object containing a 'leads' (or 'items'/'records') array.",
          },
          400,
        );
      }
      rawItems = list;
    } else {
      return jsonResponse({ ok: false, error: "Invalid JSON payload." }, 400);
    }

    if (!ALLOWED_TABLES.has(table)) {
      return jsonResponse(
        {
          ok: false,
          error: `Unsupported table "${table}". Allowed tables: ${Array.from(ALLOWED_TABLES).join(", ")}.`,
        },
        400,
      );
    }

    const parsed: ParsedEnrichEntry[] = [];
    const invalid: Array<{ index: number; raw: unknown; error: string }> = [];

    for (let i = 0; i < rawItems.length; i++) {
      const res = parseEntry(rawItems[i], i);
      if (res.entry) {
        parsed.push(res.entry);
      } else {
        invalid.push({ index: i, raw: rawItems[i], error: res.error ?? "Invalid entry" });
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const enrichedAtIso = new Date().toISOString();
    const updated: Record<string, unknown>[] = [];
    const notFound: Array<{ index: number; poc_name: string; company: string; email: string | null }> = [];
    const errors: Array<{ index: number; poc_name: string; company: string; error: string }> = [];

    for (const item of parsed) {
      // 1) Exact match on (company, poc_name)
      let { data: matches, error: findErr } = await supabase
        .from(table)
        .select("id, company, poc_name")
        .eq("company", item.company)
        .eq("poc_name", item.poc_name);

      if (findErr) {
        errors.push({
          index: item.index,
          poc_name: item.poc_name,
          company: item.company,
          error: `Lookup failed: ${findErr.message}`,
        });
        continue;
      }

      // 2) Fallback: case-insensitive match if exact lookup found nothing
      if (!matches || matches.length === 0) {
        const fallback = await supabase
          .from(table)
          .select("id, company, poc_name")
          .ilike("company", escapeIlike(item.company))
          .ilike("poc_name", escapeIlike(item.poc_name));

        if (fallback.error) {
          errors.push({
            index: item.index,
            poc_name: item.poc_name,
            company: item.company,
            error: `Fallback lookup failed: ${fallback.error.message}`,
          });
          continue;
        }
        matches = fallback.data;
      }

      if (!matches || matches.length === 0) {
        notFound.push({
          index: item.index,
          poc_name: item.poc_name,
          company: item.company,
          email: item.email,
        });
        continue;
      }

      for (const row of matches) {
        if (dryRun) {
          updated.push({
            id: row.id,
            company: row.company,
            poc_name: row.poc_name,
            email: item.email,
            enrichment_id: item.enrichment_id,
            enriched_at: enrichedAtIso,
          });
          continue;
        }

        const { data: updatedRow, error: updateErr } = await supabase
          .from(table)
          .update({
            email: item.email,
            enrichment_id: item.enrichment_id,
            enriched_at: enrichedAtIso,
          })
          .eq("id", row.id)
          .select("id, company, poc_name, email, enrichment_id, enriched_at")
          .single();

        if (updateErr) {
          errors.push({
            index: item.index,
            poc_name: item.poc_name,
            company: item.company,
            error: `Update failed: ${updateErr.message}`,
          });
          continue;
        }

        if (updatedRow) {
          updated.push(updatedRow as Record<string, unknown>);
        }
      }
    }

    const enrichedWithEmail = updated.filter((r) => r.enrichment_id === 1).length;
    const enrichedNoEmail = updated.filter((r) => r.enrichment_id === 2).length;

    return jsonResponse({
      ok: errors.length === 0,
      table,
      dry_run: dryRun,
      enriched_at: enrichedAtIso,
      counts: {
        received: rawItems.length,
        updated: updated.length,
        enriched_with_email: enrichedWithEmail,
        enriched_no_email: enrichedNoEmail,
        not_found: notFound.length,
        invalid: invalid.length,
        errors: errors.length,
      },
      updated,
      not_found: notFound,
      invalid,
      errors,
    });
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});

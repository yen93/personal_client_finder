import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DEFAULT_ACTOR_ID = "automation-lab~linkedin-company-scraper";

interface CustomerRow {
  id: number;
  name: string;
  email: string | null;
  approx_employee_count: number | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "aa")
    .replace(/\b(a\/s|aps|i\/s|k\/s|p\/s|a\.m\.b\.a|f\.m\.b\.a|ab|as|gmbh|ltd|inc|llc|holding|danmark|denmark)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractDomain(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.includes("@")) {
    const dom = trimmed.split("@").pop()?.trim() ?? "";
    return dom.replace(/^www\./, "") || null;
  }
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return trimmed.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null;
  }
}

function parseRangeMidpoint(val: unknown): number | null {
  if (typeof val === "number" && Number.isFinite(val) && val >= 0) {
    return Math.round(val);
  }
  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const start = Number(obj.start ?? obj.min ?? obj.from);
    const end = Number(obj.end ?? obj.max ?? obj.to);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end > 0) {
      return Math.round((start + end) / 2);
    }
    if (Number.isFinite(start) && start > 0) return Math.round(start);
  }
  if (typeof val === "string") {
    const cleaned = val.replace(/,/g, "").replace(/\./g, "").trim();
    const rangeMatch = cleaned.match(/(\d+)\s*[-–to]+\s*(\d+)/i);
    if (rangeMatch) {
      const a = Number(rangeMatch[1]);
      const b = Number(rangeMatch[2]);
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
        return Math.round((a + b) / 2);
      }
    }
    const plusMatch = cleaned.match(/(\d+)\s*\+/);
    if (plusMatch) {
      const a = Number(plusMatch[1]);
      if (Number.isFinite(a)) return Math.round(a);
    }
    const singleMatch = cleaned.match(/\b(\d+)\b/);
    if (singleMatch) {
      const a = Number(singleMatch[1]);
      if (Number.isFinite(a)) return Math.round(a);
    }
  }
  return null;
}

/**
 * Tip 3: Prefer exact integer employee count; fall back to midpoint of employee count range.
 */
function extractEmployeeCount(item: Record<string, unknown>): {
  count: number | null;
  sourceField: string | null;
} {
  const exactFields = [
    "employeeCount",
    "employeesCount",
    "staffCount",
    "employee_count",
    "employees_count",
    "employees",
    "exactEmployeeCount",
    "headcount",
    "numberOfEmployees",
    "antalAnsatte",
  ];
  for (const field of exactFields) {
    const v = item[field];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      return { count: Math.round(v), sourceField: field };
    }
    if (typeof v === "string" && /^\d[\d,\.]*$/.test(v.trim())) {
      const n = Number(v.replace(/[,\.]/g, ""));
      if (Number.isFinite(n) && n >= 0) {
        return { count: Math.round(n), sourceField: field };
      }
    }
  }

  // Nested objects (e.g., raw / company / headcount)
  for (const nestedKey of ["raw", "rawData", "company", "details"]) {
    const nested = item[nestedKey];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const sub = extractEmployeeCount(nested as Record<string, unknown>);
      if (sub.count !== null) {
        return { count: sub.count, sourceField: `${nestedKey}.${sub.sourceField}` };
      }
    }
  }

  // Range fallbacks -> midpoint
  const rangeFields = [
    "employeeCountRange",
    "staffCountRange",
    "companySize",
    "size",
    "employeesRange",
    "employee_range",
    "employeeRange",
  ];
  for (const field of rangeFields) {
    if (item[field] !== undefined && item[field] !== null) {
      const mid = parseRangeMidpoint(item[field]);
      if (mid !== null) {
        return { count: mid, sourceField: `${field}(midpoint)` };
      }
    }
  }

  return { count: null, sourceField: null };
}

function scoreMatch(row: CustomerRow, item: Record<string, unknown>, actorId: string): number {
  if (item.found === false || item.error) return 0;

  const isCvr = actorId.toLowerCase().includes("cvr");
  const itemName = String(
    item.name ?? item.companyName ?? item.title ?? item.universalName ?? "",
  ).trim();
  const itemWebsite = extractDomain(
    String(item.website ?? item.websiteUrl ?? item.domain ?? item.url_website ?? ""),
  );
  const itemCountry = String(
    item.country ?? item.countryCode ?? item.headquarters ?? "",
  ).toUpperCase();
  const rowDomain = extractDomain(row.email);

  const normRow = normalizeText(row.name);
  const normItem = normalizeText(itemName);
  if (!normItem) return 0;

  // Reject obviously wrong non-European websites on LinkedIn when domain doesn't match
  if (!isCvr && itemWebsite) {
    const iTld = itemWebsite.split(".").pop() ?? "";
    const foreignTlds = new Set(["in", "br", "mx", "cn", "jp", "kr", "au", "nz", "za", "ng", "pk", "bd", "id", "ph", "vn", "th", "ar", "cl", "co", "pe"]);
    if (foreignTlds.has(iTld) && rowDomain !== itemWebsite) {
      return 0;
    }
  }

  let score = 0;
  let hasGenuineEvidence = false;

  // 1. Domain-to-website or domain-to-name match
  let domainMismatch = false;
  if (rowDomain) {
    const rSld = rowDomain.split(".")[0].replace(/-/g, "");
    const itemCompact = normItem.replace(/\s+/g, "");
    if (itemWebsite) {
      if (rowDomain === itemWebsite) {
        score += 120;
        hasGenuineEvidence = true;
      } else {
        const iSld = itemWebsite.split(".")[0].replace(/-/g, "");
        const rTld = rowDomain.split(".").pop();
        const iTld = itemWebsite.split(".").pop();
        const isEuro = /\b(DK|DENMARK|DANMARK|SE|SWEDEN|NO|NORWAY|FI|FINLAND|DE|GERMANY|NL|UK|GB|EU)\b/.test(itemCountry);
        if (rSld.length >= 3 && rSld === iSld && (rTld === iTld || iTld === "com" || iTld === "eu" || iTld === "dk" || isEuro)) {
          score += 85;
          hasGenuineEvidence = true;
        } else {
          domainMismatch = true;
        }
      }
    } else if (rSld.length >= 3 && (itemCompact.includes(rSld) || normItem.split(" ").includes(rSld))) {
      // e.g. Fagbladsgruppen A/S (tdc@fbg.dk) -> FBG Medier A/S
      score += 80;
      hasGenuineEvidence = true;
    }
  }

  // 2. Name similarity (order-insensitive token overlap handles "Kjær, Jens Ole" <-> "JENS OLE KJÆR")
  if (normRow && normItem) {
    const rToks = new Set(normRow.split(" ").filter((t) => t.length >= 2));
    const iToks = new Set(normItem.split(" ").filter((t) => t.length >= 2));
    let overlap = 0;
    for (const t of rToks) if (iToks.has(t)) overlap++;
    const unionMax = Math.max(rToks.size, iToks.size);
    const ratio = unionMax > 0 ? overlap / unionMax : 0;

    if (normRow === normItem || (rToks.size > 0 && ratio === 1)) {
      score += 90;
      hasGenuineEvidence = true;
    } else if (
      (normRow.length >= 4 && normItem.includes(normRow)) ||
      (normItem.length >= 4 && normRow.includes(normItem))
    ) {
      score += 65;
      hasGenuineEvidence = true;
    } else if (ratio >= 0.5 && overlap >= 1) {
      score += Math.round(ratio * 70);
      hasGenuineEvidence = true;
    }
  }

  if (!hasGenuineEvidence) return 0;

  // 3. Country check for LinkedIn
  if (!isCvr) {
    const isEuro = /\b(DK|DENMARK|DANMARK|SE|SWEDEN|NO|NORWAY|FI|FINLAND|DE|GERMANY|NL|UK|GB|FR|CH|AT|BE|PL|CZ|EE|LT|LV|IE)\b/.test(itemCountry);
    if (isEuro) {
      score += 20;
    } else if (itemCountry && domainMismatch) {
      return 0;
    } else if (itemCountry && !rowDomain) {
      // Non-European LinkedIn result with no email domain to confirm it
      score -= 40;
    }
  }

  return Math.max(0, score);
}

function stripLegalSuffixForLinkedIn(name: string): string {
  return name
    .replace(/\b(a\/s|aps|i\/s|k\/s|p\/s|a\.m\.b\.a|f\.m\.b\.a|s\/i|aktieselskab|anpartsselskab|partnerselskab)\b\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,\-]+$/, "")
    .trim();
}

function buildActorInput(
  actorId: string,
  rows: CustomerRow[],
  extraInput?: Record<string, unknown>,
): Record<string, unknown> {
  const rawNames = rows.map((r) => r.name);
  const liNames = rows.map((r) => stripLegalSuffixForLinkedIn(r.name) || r.name);
  const norm = actorId.replace("/", "~").toLowerCase();

  if (norm.startsWith("harvestapi~linkedin-company")) {
    return {
      searches: liNames,
      ...(extraInput ?? {}),
    };
  }
  if (norm.startsWith("automation-lab~linkedin-company-scraper")) {
    return {
      companyNames: liNames,
      maxCompanies: liNames.length,
      ...(extraInput ?? {}),
    };
  }
  if (norm.startsWith("scrapeworks~denmark-cvr-company-health")) {
    return {
      companies: rawNames,
      country: "dk",
      contactEmail: "data-enrichment@clientfinder.app",
      includeRawData: true,
      ...(extraInput ?? {}),
    };
  }
  return {
    companies: rawNames,
    ...(extraInput ?? {}),
  };
}

async function getApifyLimits(apifyToken: string) {
  const res = await fetch("https://api.apify.com/v2/users/me/limits", {
    headers: { Authorization: `Bearer ${apifyToken}` },
  });
  if (!res.ok) {
    return { ok: false, status: res.status, error: (await res.text()).slice(0, 300) };
  }
  const body = await res.json();
  const data = body?.data ?? {};
  return {
    ok: true,
    monthlyUsageUsd: data?.current?.monthlyUsageUsd ?? null,
    maxMonthlyUsageUsd: data?.limits?.maxMonthlyUsageUsd ?? null,
    remainingUsd:
      typeof data?.limits?.maxMonthlyUsageUsd === "number" &&
      typeof data?.current?.monthlyUsageUsd === "number"
        ? Number((data.limits.maxMonthlyUsageUsd - data.current.monthlyUsageUsd).toFixed(4))
        : null,
    cycleEndAt: data?.monthlyUsageCycle?.endAt ?? null,
  };
}

async function runApifyActorSync(
  actorId: string,
  input: Record<string, unknown>,
  apifyToken: string,
  timeoutSecs = 120,
): Promise<{
  runId: string | null;
  status: string;
  usageTotalUsd: number | null;
  items: Record<string, unknown>[];
}> {
  const normalizedActorId = actorId.replace("/", "~");
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(normalizedActorId)}/runs?waitForFinish=${timeoutSecs}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apifyToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  if (!startRes.ok) {
    const errText = await startRes.text();
    throw new Error(`Apify actor "${normalizedActorId}" start failed (${startRes.status}): ${errText.slice(0, 500)}`);
  }
  const runBody = await startRes.json();
  const run = runBody?.data ?? {};
  const runId = run.id ?? null;
  const status = String(run.status ?? "UNKNOWN");
  const datasetId = run.defaultDatasetId;
  const usageTotalUsd = typeof run.usageTotalUsd === "number" ? run.usageTotalUsd : null;

  if (!datasetId) {
    return { runId, status, usageTotalUsd, items: [] };
  }

  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json`,
    { headers: { Authorization: `Bearer ${apifyToken}` } },
  );
  if (!itemsRes.ok) {
    const errText = await itemsRes.text();
    throw new Error(`Failed to fetch dataset ${datasetId} (${itemsRes.status}): ${errText.slice(0, 400)}`);
  }
  const items = await itemsRes.json();
  return {
    runId,
    status,
    usageTotalUsd,
    items: Array.isArray(items) ? (items as Record<string, unknown>[]) : [],
  };
}

async function startApifyActorAsync(
  actorId: string,
  input: Record<string, unknown>,
  apifyToken: string,
  webhookUrl: string,
  anonKey: string,
  rowIds: number[],
): Promise<{ runId: string; defaultDatasetId: string; status: string }> {
  const normalizedActorId = actorId.replace("/", "~");
  const webhooks = [
    {
      eventTypes: ["ACTOR.RUN.SUCCEEDED"],
      requestUrl: webhookUrl,
      headersTemplate: JSON.stringify({
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        "Content-Type": "application/json",
      }),
      payloadTemplate: JSON.stringify({
        stage: "done",
        actorId: normalizedActorId,
        rowIds,
        runId: "{{resource.id}}",
        datasetId: "{{resource.defaultDatasetId}}",
        usageTotalUsd: "{{resource.usageTotalUsd}}",
      }),
    },
  ];
  const encodedWebhooks = btoa(JSON.stringify(webhooks));
  const res = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(normalizedActorId)}/runs?webhooks=${encodeURIComponent(encodedWebhooks)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apifyToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Apify async start failed (${res.status}): ${errText.slice(0, 500)}`);
  }
  const body = await res.json();
  const run = body?.data ?? {};
  return {
    runId: String(run.id ?? ""),
    defaultDatasetId: String(run.defaultDatasetId ?? ""),
    status: String(run.status ?? "RUNNING"),
  };
}

async function matchAndUpdateRows(
  supabase: ReturnType<typeof createClient>,
  rows: CustomerRow[],
  items: Record<string, unknown>[],
  actorId: string,
  dryRun: boolean,
  minScore = 50,
) {
  const matched: Array<{
    id: number;
    name: string;
    email: string | null;
    matched_name: string;
    matched_website: string | null;
    approx_employee_count: number;
    source_field: string | null;
    score: number;
  }> = [];
  const unmatched: Array<{ id: number; name: string; best_score: number }> = [];

  for (const row of rows) {
    let bestItem: Record<string, unknown> | null = null;
    let bestScore = 0;
    for (const item of items) {
      const sc = scoreMatch(row, item, actorId);
      if (sc > bestScore) {
        bestScore = sc;
        bestItem = item;
      }
    }
    if (bestItem && bestScore >= minScore) {
      const { count, sourceField } = extractEmployeeCount(bestItem);
      if (count !== null) {
        matched.push({
          id: row.id,
          name: row.name,
          email: row.email,
          matched_name: String(bestItem.name ?? bestItem.companyName ?? bestItem.title ?? ""),
          matched_website: extractDomain(String(bestItem.website ?? bestItem.websiteUrl ?? "")),
          approx_employee_count: count,
          source_field: sourceField,
          score: bestScore,
        });
        if (!dryRun) {
          const { error } = await supabase
            .from("autodoc_customer_emails")
            .update({ approx_employee_count: count })
            .eq("id", row.id);
          if (error) {
            throw new Error(`DB update failed for id=${row.id}: ${error.message}`);
          }
        }
        continue;
      }
    }
    unmatched.push({ id: row.id, name: row.name, best_score: bestScore });
  }

  return { matched, unmatched };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const apifyToken =
    Deno.env.get("APIFY_TOKEN") ?? Deno.env.get("APIFY_API_TOKEN") ?? "";

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    if (req.method === "GET") {
      const limits = apifyToken ? await getApifyLimits(apifyToken) : { ok: false, error: "Missing APIFY_TOKEN" };
      const { count: total } = await supabase
        .from("autodoc_customer_emails")
        .select("*", { count: "exact", head: true });
      const { count: enriched } = await supabase
        .from("autodoc_customer_emails")
        .select("*", { count: "exact", head: true })
        .not("approx_employee_count", "is", null);
      return jsonResponse({
        ok: true,
        function: "enrich-autodoc-employees",
        defaultActorId: DEFAULT_ACTOR_ID,
        apifyLimits: limits,
        tableStats: {
          total: total ?? 0,
          enriched: enriched ?? 0,
          remaining: (total ?? 0) - (enriched ?? 0),
        },
      });
    }

    if (req.method !== "POST") {
      return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
    }

    if (!apifyToken) {
      return jsonResponse({ ok: false, error: "Missing APIFY_TOKEN secret" }, 500);
    }

    const body = await req.json().catch(() => ({}));

    // Handle Apify webhook callback (stage=done)
    if (body?.stage === "done" && body?.datasetId && Array.isArray(body?.rowIds)) {
      const datasetId = String(body.datasetId);
      const rowIds = (body.rowIds as unknown[]).map((x) => Number(x)).filter(Number.isFinite);
      const itemsRes = await fetch(
        `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json`,
        { headers: { Authorization: `Bearer ${apifyToken}` } },
      );
      if (!itemsRes.ok) {
        return jsonResponse(
          { ok: false, error: `Dataset fetch failed (${itemsRes.status})` },
          502,
        );
      }
      const items = (await itemsRes.json()) as Record<string, unknown>[];
      const { data: rows, error } = await supabase
        .from("autodoc_customer_emails")
        .select("id, name, email, approx_employee_count")
        .in("id", rowIds);
      if (error) {
        return jsonResponse({ ok: false, error: error.message }, 500);
      }
      const { matched, unmatched } = await matchAndUpdateRows(
        supabase,
        (rows ?? []) as CustomerRow[],
        Array.isArray(items) ? items : [],
        String(body.actorId ?? DEFAULT_ACTOR_ID),
        false,
      );
      return jsonResponse({
        ok: true,
        stage: "done",
        runId: body.runId ?? null,
        datasetId,
        usageTotalUsd: body.usageTotalUsd ?? null,
        itemsCount: Array.isArray(items) ? items.length : 0,
        matchedCount: matched.length,
        unmatchedCount: unmatched.length,
      });
    }

    if (body?.action === "limits") {
      const limits = await getApifyLimits(apifyToken);
      return jsonResponse({ ok: true, apifyLimits: limits });
    }

    const actorId = String(body?.actorId ?? DEFAULT_ACTOR_ID);
    const mode = body?.mode === "async" ? "async" : "sync";
    const limit = Math.min(Math.max(Number(body?.limit ?? 20), 1), 250);
    const afterId = Math.max(Number(body?.afterId ?? 0), 0);
    const dryRun = Boolean(body?.dryRun ?? false);
    const preferWithEmail = Boolean(body?.preferWithEmail ?? false);
    const includeRawSample = Boolean(body?.includeRawSample ?? false);
    const minScore = Number(body?.minScore ?? 50);
    const extraInput =
      body?.extraInput && typeof body.extraInput === "object"
        ? (body.extraInput as Record<string, unknown>)
        : undefined;

    let targetRows: CustomerRow[] = [];
    if (Array.isArray(body?.rowIds) && body.rowIds.length > 0) {
      const ids = (body.rowIds as unknown[]).map((x) => Number(x)).filter(Number.isFinite);
      const { data: rows, error: dbErr } = await supabase
        .from("autodoc_customer_emails")
        .select("id, name, email, approx_employee_count")
        .in("id", ids)
        .is("approx_employee_count", null)
        .order("id", { ascending: true });
      if (dbErr) {
        return jsonResponse({ ok: false, error: dbErr.message }, 500);
      }
      targetRows = (rows ?? []) as CustomerRow[];
    } else {
      let query = supabase
        .from("autodoc_customer_emails")
        .select("id, name, email, approx_employee_count")
        .is("approx_employee_count", null)
        .gt("id", afterId)
        .order("id", { ascending: true })
        .limit(limit);

      if (preferWithEmail) {
        query = query.not("email", "is", null);
      }

      const { data: rows, error: dbErr } = await query;
      if (dbErr) {
        return jsonResponse({ ok: false, error: dbErr.message }, 500);
      }
      targetRows = (rows ?? []) as CustomerRow[];
    }
    if (targetRows.length === 0) {
      return jsonResponse({ ok: true, message: "No unenriched rows remaining.", processed: 0, lastId: afterId });
    }

    const actorInput = buildActorInput(actorId, targetRows, extraInput);
    const firstId = targetRows[0].id;
    const lastId = targetRows[targetRows.length - 1].id;

    if (mode === "async") {
      const webhookUrl = `${supabaseUrl}/functions/v1/enrich-autodoc-employees`;
      const started = await startApifyActorAsync(
        actorId,
        actorInput,
        apifyToken,
        webhookUrl,
        anonKey,
        targetRows.map((r) => r.id),
      );
      return jsonResponse(
        {
          ok: true,
          mode: "async",
          actorId,
          batchSize: targetRows.length,
          firstId,
          lastId,
          run: started,
        },
        202,
      );
    }

    const runResult = await runApifyActorSync(actorId, actorInput, apifyToken, 120);
    const { matched, unmatched } = await matchAndUpdateRows(
      supabase,
      targetRows,
      runResult.items,
      actorId,
      dryRun,
      minScore,
    );

    return jsonResponse({
      ok: true,
      mode: "sync",
      dryRun,
      actorId,
      runId: runResult.runId,
      runStatus: runResult.status,
      usageTotalUsd: runResult.usageTotalUsd,
      firstId,
      lastId,
      requestedCount: targetRows.length,
      returnedItemsCount: runResult.items.length,
      matchedCount: matched.length,
      unmatchedCount: unmatched.length,
      matched,
      unmatched,
      ...(includeRawSample ? { rawSample: runResult.items.slice(0, 3) } : {}),
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

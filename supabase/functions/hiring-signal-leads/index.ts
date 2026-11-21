import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DEFAULT_ROLES = [
  "Admin Assistant",
  "Operations Coordinator",
  "Sales Admin",
  "SDR",
];

const DEFAULT_POC_TITLES = [
  "Founder",
  "Co-Founder",
  "Owner",
  "Managing Director",
  "CEO",
  "General Manager",
  "Operations Manager",
  "Office Manager",
];

const DEFAULT_JOB_ACTOR_ID = "bebity~linkedin-jobs-scraper";
const DEFAULT_LEADS_ACTOR_ID = "deepmine~linkedin-company-employees";

const DEFAULT_DEEPMINE_SENIORITY = [
  "Owner",
  "Partner",
  "CXO",
  "VP",
  "Director",
  "Manager",
];

function isPublicSectorOrInstitution(companyName: string): boolean {
  return /\b(university|tafe|government|department of|city council|shire council|hospital|ministry of|public school)\b/i.test(
    companyName,
  );
}

// Domains that belong to job boards / ATS platforms rather than the hiring company itself
const NON_COMPANY_DOMAINS = new Set([
  "linkedin.com",
  "seek.com.au",
  "indeed.com",
  "glassdoor.com",
  "greenhouse.io",
  "boards.greenhouse.io",
  "lever.co",
  "jobs.lever.co",
  "workday.com",
  "myworkdayjobs.com",
  "ashbyhq.com",
  "jobs.ashbyhq.com",
  "bamboohr.com",
  "smartrecruiters.com",
  "icims.com",
  "jobvite.com",
  "recruitee.com",
  "workable.com",
  "apply.workable.com",
  "breezy.hr",
  "jazzhr.com",
  "taleo.net",
  "successfactors.com",
  "employmenthero.com",
  "swagapp.com",
]);

interface RequestPayload {
  roles?: string[];
  location?: string;
  rowsPerRole?: number;
  publishedAt?: string;
  minEmployees?: number;
  maxEmployees?: number;
  includeUnknownSize?: boolean;
  maxCompanies?: number;
  targetPocTitles?: string[];
  jobActorId?: string;
  leadsActorId?: string;
  dryRun?: boolean;
}

interface DiscoveredCompany {
  company: string;
  normalizedCompany: string;
  domain: string | null;
  hiringRole: string;
  jobUrl: string | null;
  employeesCount: number | null;
  posterName: string | null;
  posterRole: string | null;
}

interface ResolvedLead {
  company: string;
  poc_name: string;
  poc_role: string;
  company_domain: string | null;
  hiring_role: string;
  job_url: string | null;
  source: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\b(pty|ltd|limited|llc|inc|corp|corporation|co|group|australia|au|uk|us|usa|nz)\b\.?/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractDomain(rawUrl: unknown): string | null {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;
  let candidate = rawUrl.trim();
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const host = new URL(candidate).hostname.toLowerCase().replace(/^www\./, "");
    if (!host || !host.includes(".")) return null;
    for (const blocked of NON_COMPANY_DOMAINS) {
      if (host === blocked || host.endsWith(`.${blocked}`)) return null;
    }
    return host;
  } catch {
    return null;
  }
}

function parseEmployeeCount(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/,/g, "");
    const nums = cleaned.match(/\d+/g)?.map(Number).filter(Number.isFinite);
    if (!nums || nums.length === 0) return null;
    // If a range like "11-50", use the upper bound conservatively
    return nums.length >= 2 ? Math.max(...nums) : nums[0];
  }
  return null;
}

function asNonEmptyString(val: unknown): string | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function scorePocRole(role: string): number {
  const r = role.toLowerCase();
  if (/\b(founder|co-founder|cofounder|owner|proprietor)\b/.test(r)) return 100;
  if (/\b(managing director|ceo|chief executive|principal|partner)\b/.test(r)) {
    return 90;
  }
  if (/\b(coo|chief operating|general manager|head of operations|vp of operations)\b/.test(r)) {
    return 80;
  }
  if (/\b(operations manager|ops manager|office manager|practice manager|business manager)\b/.test(r)) {
    return 70;
  }
  if (/\b(director|vp|vice president|head of)\b/.test(r)) return 55;
  if (/\b(manager|lead)\b/.test(r)) return 40;
  return 20;
}

function looksLikeExternalRecruiter(role: string | null): boolean {
  if (!role) return false;
  return /\b(talent acquisition|recruiter|recruitment consultant|staffing|headhunter)\b/i.test(
    role,
  );
}

async function runApifyActorSync(
  actorId: string,
  input: Record<string, unknown>,
  apifyToken: string,
  timeoutSecs = 85,
): Promise<Record<string, unknown>[]> {
  const normalizedActorId = actorId.replace("/", "~");
  const url =
    `https://api.apify.com/v2/acts/${encodeURIComponent(normalizedActorId)}` +
    `/run-sync-get-dataset-items?timeout=${timeoutSecs}&format=json&clean=true`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apifyToken}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Apify actor "${normalizedActorId}" failed (${res.status}): ${errText.slice(0, 400)}`,
    );
  }

  const data = await res.json();
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const apifyToken =
    Deno.env.get("APIFY_TOKEN") ?? Deno.env.get("APIFY_API_TOKEN") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (req.method === "GET") {
    return jsonResponse({
      ok: true,
      function: "hiring-signal-leads",
      has_apify_token: Boolean(apifyToken),
      default_job_actor: DEFAULT_JOB_ACTOR_ID,
      default_leads_actor: DEFAULT_LEADS_ACTOR_ID,
      default_roles: DEFAULT_ROLES,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use GET or POST." }, 405);
  }

  if (!apifyToken) {
    return jsonResponse(
      {
        error:
          "Missing APIFY_TOKEN secret. Set APIFY_TOKEN in Supabase Edge Function secrets for project uwsncuowtzydylfabikj.",
      },
      500,
    );
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY runtime env." },
      500,
    );
  }

  let body: RequestPayload = {};
  try {
    const rawText = await req.text();
    if (rawText.trim()) {
      body = JSON.parse(rawText) as RequestPayload;
    }
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  const roles =
    Array.isArray(body.roles) && body.roles.length > 0
      ? body.roles.map((r) => String(r).trim()).filter(Boolean)
      : DEFAULT_ROLES;
  const location = asNonEmptyString(body.location) ?? "Australia";
  const rowsPerRole = Math.min(Math.max(Number(body.rowsPerRole ?? 15), 1), 50);
  const publishedAt = asNonEmptyString(body.publishedAt) ?? "r604800";
  const minEmployees = Math.max(Number(body.minEmployees ?? 5), 1);
  const maxEmployees = Math.max(Number(body.maxEmployees ?? 50), minEmployees);
  const includeUnknownSize = body.includeUnknownSize ?? true;
  const maxCompanies = Math.min(Math.max(Number(body.maxCompanies ?? 25), 1), 50);
  const targetPocTitles =
    Array.isArray(body.targetPocTitles) && body.targetPocTitles.length > 0
      ? body.targetPocTitles.map((t) => String(t).trim()).filter(Boolean)
      : DEFAULT_POC_TITLES;
  const jobActorId = asNonEmptyString(body.jobActorId) ?? DEFAULT_JOB_ACTOR_ID;
  const leadsActorId =
    asNonEmptyString(body.leadsActorId) ?? DEFAULT_LEADS_ACTOR_ID;
  const dryRun = Boolean(body.dryRun);

  try {
    // -------------------------------------------------------------------------
    // Stage 1: Scrape #1 Buying Signal (companies actively hiring admin/ops/SDR)
    // -------------------------------------------------------------------------
    const jobRuns = await Promise.allSettled(
      roles.map((role) =>
        runApifyActorSync(
          jobActorId,
          {
            title: role,
            location,
            rows: rowsPerRole,
            publishedAt,
          },
          apifyToken,
          80,
        ).then((items) => ({ role, items }))
      ),
    );

    const jobErrors: string[] = [];
    const companiesByKey = new Map<string, DiscoveredCompany>();

    for (const result of jobRuns) {
      if (result.status === "rejected") {
        jobErrors.push(String(result.reason));
        continue;
      }

      const { role: searchedRole, items } = result.value;

      for (const item of items) {
        const companyProfile =
          item.companyProfile && typeof item.companyProfile === "object"
            ? (item.companyProfile as Record<string, unknown>)
            : null;

        const companyName =
          asNonEmptyString(item.companyName) ??
          asNonEmptyString(item.company) ??
          asNonEmptyString(item.company_name) ??
          asNonEmptyString(companyProfile?.name);

        if (!companyName || isPublicSectorOrInstitution(companyName)) continue;

        const sizeBracketCount = parseEmployeeCount(
          item.companySize ?? item.companyStaffCountRange,
        );
        const rawEmployeeCount = parseEmployeeCount(
          item.companyEmployeeCount ??
            item.companyEmployeesCount ??
            companyProfile?.employeesCount ??
            item.companyStaffCount,
        );
        const employeesCount =
          sizeBracketCount !== null && rawEmployeeCount !== null
            ? Math.max(sizeBracketCount, rawEmployeeCount)
            : (sizeBracketCount ?? rawEmployeeCount);

        if (employeesCount !== null) {
          if (employeesCount < minEmployees || employeesCount > maxEmployees) {
            continue;
          }
        } else if (!includeUnknownSize) {
          continue;
        }

        const domain =
          extractDomain(item.companyWebsite) ??
          extractDomain(companyProfile?.website) ??
          extractDomain(item.company_website) ??
          extractDomain(item.applyUrl);

        const normalizedCompany = normalizeCompanyName(companyName);
        const dedupeKey = domain ?? normalizedCompany;
        if (!dedupeKey || companiesByKey.has(dedupeKey)) continue;

        const hiringRole =
          asNonEmptyString(item.title) ??
          asNonEmptyString(item.jobTitle) ??
          asNonEmptyString(item.positionName) ??
          searchedRole;

        const jobUrl =
          asNonEmptyString(item.jobUrl) ??
          asNonEmptyString(item.url) ??
          asNonEmptyString(item.applyUrl);

        const posterName =
          asNonEmptyString(item.posterFullName) ??
          asNonEmptyString(item.posterName);
        const posterRole =
          asNonEmptyString(item.posterHeadline) ??
          asNonEmptyString(item.posterTitle);

        companiesByKey.set(dedupeKey, {
          company: companyName,
          normalizedCompany,
          domain,
          hiringRole,
          jobUrl,
          employeesCount,
          posterName,
          posterRole,
        });

        if (companiesByKey.size >= maxCompanies) break;
      }

      if (companiesByKey.size >= maxCompanies) break;
    }

    const discoveredCompanies = Array.from(companiesByKey.values());

    if (discoveredCompanies.length === 0) {
      return jsonResponse({
        ok: true,
        dry_run: dryRun,
        companies_discovered: 0,
        saved_count: 0,
        skipped_no_poc: 0,
        job_errors: jobErrors,
        leads: [],
      });
    }

    // -------------------------------------------------------------------------
    // Stage 2: Resolve best decision-maker POC (poc_name, poc_role) via Apify
    // -------------------------------------------------------------------------
    const domains = discoveredCompanies
      .map((c) => c.domain)
      .filter((d): d is string => Boolean(d));

    const pocErrors: string[] = [];
    const pocByDomain = new Map<
      string,
      { name: string; role: string; score: number }
    >();
    const pocByCompany = new Map<
      string,
      { name: string; role: string; score: number }
    >();

    const isDeepmineActor = leadsActorId.toLowerCase().includes("deepmine");

    try {
      let pocItems: Record<string, unknown>[] = [];

      if (isDeepmineActor) {
        pocItems = await runApifyActorSync(
          leadsActorId,
          {
            companies: discoveredCompanies.map((c) => c.company),
            maxResults: 5,
            location,
            strictLocation: false,
            seniorityLevels: DEFAULT_DEEPMINE_SENIORITY,
            enrichProfiles: false,
            maxResultsTotal: Math.min(discoveredCompanies.length * 5, 100),
            proxyConfiguration: { useApifyProxy: true },
          },
          apifyToken,
          110,
        );
      } else if (domains.length > 0) {
        pocItems = await runApifyActorSync(
          leadsActorId,
          {
            company_domain: domains,
            contact_job_title: targetPocTitles,
            fetch_count: Math.min(domains.length * 4, 100),
          },
          apifyToken,
          85,
        );
      }

      for (const p of pocItems) {
        const fullName =
          asNonEmptyString(p.fullName) ??
          asNonEmptyString(p.full_name) ??
          asNonEmptyString(p.name) ??
          asNonEmptyString(
            `${asNonEmptyString(p.firstName) ?? asNonEmptyString(p.first_name) ?? ""} ${
              asNonEmptyString(p.lastName) ?? asNonEmptyString(p.last_name) ?? ""
            }`.trim(),
          );
        const role =
          asNonEmptyString(p.jobTitle) ??
          asNonEmptyString(p.job_title) ??
          asNonEmptyString(p.title) ??
          asNonEmptyString(p.headline);

        if (!fullName || !role) continue;

        // Clean LinkedIn headline noise like "Founder at Acme | ..." if jobTitle fell back to headline
        const cleanRole = role.split(/\s+[|•·]\s+/)[0].trim() || role;
        const score = scorePocRole(cleanRole);

        const contactDomain =
          extractDomain(p.company_domain) ??
          extractDomain(p.company_website) ??
          extractDomain(p.organization_website_url);

        // deepmine echoes back the exact searched company name in searchQuery
        const searchedCompany = asNonEmptyString(p.searchQuery);
        const contactCompany =
          asNonEmptyString(p.currentCompany) ??
          asNonEmptyString(p.company_name) ??
          asNonEmptyString(p.organization_name);

        if (contactDomain) {
          const existing = pocByDomain.get(contactDomain);
          if (!existing || score > existing.score) {
            pocByDomain.set(contactDomain, {
              name: fullName,
              role: cleanRole,
              score,
            });
          }
        }

        for (const compCandidate of [searchedCompany, contactCompany]) {
          if (!compCandidate) continue;
          const norm = normalizeCompanyName(compCandidate);
          if (!norm) continue;
          const existing = pocByCompany.get(norm);
          if (!existing || score > existing.score) {
            pocByCompany.set(norm, { name: fullName, role: cleanRole, score });
          }
        }
      }
    } catch (err) {
      pocErrors.push(String(err));
    }

    const resolvedLeads: ResolvedLead[] = [];
    let skippedNoPoc = 0;

    for (const comp of discoveredCompanies) {
      const matched =
        (comp.domain ? pocByDomain.get(comp.domain) : undefined) ??
        pocByCompany.get(comp.normalizedCompany);

      let pocName: string | null = matched?.name ?? null;
      let pocRole: string | null = matched?.role ?? null;
      let source = `apify:${jobActorId}+${leadsActorId}`;

      // Fallback to job poster if Leads Finder had no match and poster is not an external recruiter
      if (!pocName && comp.posterName && !looksLikeExternalRecruiter(comp.posterRole)) {
        pocName = comp.posterName;
        pocRole = comp.posterRole ?? "Hiring Manager";
        source = `apify:${jobActorId}:poster`;
      }

      if (!pocName || !pocRole) {
        skippedNoPoc += 1;
        continue;
      }

      resolvedLeads.push({
        company: comp.company,
        poc_name: pocName,
        poc_role: pocRole,
        company_domain: comp.domain,
        hiring_role: comp.hiringRole,
        job_url: comp.jobUrl,
        source,
      });
    }

    // -------------------------------------------------------------------------
    // Stage 3: Upsert into public.au_hiring_signal_leads (upsert-only, no deletes)
    // -------------------------------------------------------------------------
    let savedRows: Record<string, unknown>[] = [];
    if (!dryRun && resolvedLeads.length > 0) {
      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      });

      const { data, error } = await supabase
        .from("au_hiring_signal_leads")
        .upsert(resolvedLeads, {
          onConflict: "company,poc_name",
          ignoreDuplicates: false,
        })
        .select("id, company, poc_name, poc_role, hiring_role, company_domain");

      if (error) {
        throw new Error(`Supabase upsert failed: ${error.message}`);
      }
      savedRows = (data ?? []) as Record<string, unknown>[];
    }

    return jsonResponse({
      ok: true,
      dry_run: dryRun,
      companies_discovered: discoveredCompanies.length,
      domains_found: domains.length,
      leads_resolved: resolvedLeads.length,
      saved_count: dryRun ? 0 : savedRows.length,
      skipped_no_poc: skippedNoPoc,
      job_errors: jobErrors,
      poc_errors: pocErrors,
      leads: dryRun
        ? resolvedLeads.map(({ company, poc_name, poc_role, hiring_role }) => ({
            company,
            poc_name,
            poc_role,
            hiring_role,
          }))
        : savedRows,
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

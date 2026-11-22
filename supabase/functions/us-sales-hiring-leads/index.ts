import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const TARGET_COUNTRY = "United States";

const DEFAULT_SALES_ROLES = [
  "Sales Development Representative",
  "Business Development Representative",
  "Lead Generation Specialist",
  "Outbound Sales Representative",
];

const DEFAULT_POC_TITLES = [
  "Founder",
  "Co-Founder",
  "Owner",
  "CEO",
  "President",
  "VP of Sales",
  "Head of Sales",
  "Chief Revenue Officer",
  "Director of Sales",
  "Managing Director",
  "Operations Manager",
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

// Domains belonging to job boards / ATS platforms rather than the hiring company
const NON_COMPANY_DOMAINS = new Set([
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "ziprecruiter.com",
  "monster.com",
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
  "paylocity.com",
  "paycomonline.net",
  "adp.com",
]);

interface FilterConfig {
  minEmployees: number;
  maxEmployees: number;
  includeUnknownSize: boolean;
  maxCompanies: number;
  targetPocTitles: string[];
  jobActorId: string;
  leadsActorId: string;
  dryRun: boolean;
}

interface RequestPayload {
  mode?: "async" | "sync";
  roles?: string[];
  usLocation?: string;
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
  jobLocation: string | null;
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
  job_location: string | null;
  job_url: string | null;
  source: string;
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

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\b(llc|inc|incorporated|corp|corporation|co|ltd|limited|llp|lp|group|usa|us|america)\b\.?/g,
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
    return nums.length >= 2 ? Math.max(...nums) : nums[0];
  }
  return null;
}

function isNonTargetOrganization(companyName: string): boolean {
  return (
    /(university|college|\bschool\b|school district|hospital|health system|government|department of|city of |county of |state of |ministry of)/i
      .test(companyName) ||
    /\b(robert half|randstad|adecco|manpower|teksystems|insight global|aerotek|kelly services|aston carter|kforce|apex systems|cybercoders|jobot|lhh|michael page|hays|beacon hill|actalent|motion recruitment|execu-search)\b/i
      .test(companyName)
  );
}

function isOutboundOrLeadGenJobTitle(title: string): boolean {
  const isExcluded =
    /\b(retail|store|cashier|merchandising|door[- ]to[- ]door|d2d|field sales|counter sales|showroom|dealership|automotive sales|canvasser|customer service)\b/i
      .test(title);
  if (isExcluded) return false;

  return /\b(sdr|bdr|sales development|business development representative|business development specialist|business development associate|business development coordinator|lead gen|lead generation|outbound|cold call|cold calling|appointment setter|prospecting|inside sales|demand gen|demand generation)\b/i
    .test(title);
}

function isNonUsLocation(loc: string | null): boolean {
  if (!loc) return false;
  return /\b(australia|united kingdom|\buk\b|canada|india|germany|france|singapore|ireland|new zealand|philippines|netherlands|spain|italy|brazil|mexico)\b/i
    .test(loc);
}

function scoreSalesDecisionMaker(role: string): number {
  const r = role.toLowerCase();
  if (/\b(founder|co-founder|cofounder|owner|proprietor)\b/.test(r)) return 100;
  if (/\b(ceo|chief executive|president|managing director|principal|partner)\b/.test(r)) {
    return 95;
  }
  if (
    /\b(cro|chief revenue|vp of sales|vp sales|vice president.*sales|head of sales|director of sales|sales director|vp of revenue|head of revenue|vp.*business development|head of growth)\b/
      .test(r)
  ) {
    return 90;
  }
  if (/\b(coo|chief operating|general manager|head of operations|vp of operations)\b/.test(r)) {
    return 80;
  }
  if (/\b(sales operations manager|revops|revenue operations|sales manager|operations manager|business development manager)\b/.test(r)) {
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

function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function fetchApifyDatasetItems(
  datasetId: string,
  apifyToken: string,
): Promise<Record<string, unknown>[]> {
  const url =
    `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}` +
    `/items?format=json&clean=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apifyToken}` },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Failed to fetch Apify dataset "${datasetId}" (${res.status}): ${errText.slice(0, 300)}`,
    );
  }
  const data = await res.json();
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

async function startApifyActorAsync(
  actorId: string,
  input: Record<string, unknown>,
  apifyToken: string,
  webhook: {
    requestUrl: string;
    headersTemplate: string;
    payloadTemplate: string;
  },
): Promise<{ runId: string; datasetId: string }> {
  const normalizedActorId = actorId.replace("/", "~");
  const webhooksParam = encodeURIComponent(
    toBase64Utf8(
      JSON.stringify([
        {
          eventTypes: [
            "ACTOR.RUN.SUCCEEDED",
            "ACTOR.RUN.FAILED",
            "ACTOR.RUN.TIMED_OUT",
            "ACTOR.RUN.ABORTED",
          ],
          requestUrl: webhook.requestUrl,
          headersTemplate: webhook.headersTemplate,
          payloadTemplate: webhook.payloadTemplate,
        },
      ]),
    ),
  );

  const url =
    `https://api.apify.com/v2/acts/${encodeURIComponent(normalizedActorId)}` +
    `/runs?webhooks=${webhooksParam}`;

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
      `Failed to start Apify actor "${normalizedActorId}" (${res.status}): ${errText.slice(0, 400)}`,
    );
  }

  const json = (await res.json()) as {
    data?: { id?: string; defaultDatasetId?: string };
  };
  return {
    runId: json.data?.id ?? "",
    datasetId: json.data?.defaultDatasetId ?? "",
  };
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

function extractDiscoveredCompanies(
  items: Record<string, unknown>[],
  searchedRole: string,
  cfg: FilterConfig,
): DiscoveredCompany[] {
  const companiesByKey = new Map<string, DiscoveredCompany>();

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

    if (!companyName || isNonTargetOrganization(companyName)) continue;

    const hiringRole =
      asNonEmptyString(item.title) ??
      asNonEmptyString(item.jobTitle) ??
      asNonEmptyString(item.positionName) ??
      searchedRole;

    if (!isOutboundOrLeadGenJobTitle(hiringRole)) continue;

    const jobLocation = asNonEmptyString(item.location);
    if (isNonUsLocation(jobLocation)) continue;

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
      if (
        employeesCount < cfg.minEmployees ||
        employeesCount > cfg.maxEmployees
      ) {
        continue;
      }
    } else if (!cfg.includeUnknownSize) {
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
      jobLocation,
      jobUrl,
      employeesCount,
      posterName,
      posterRole,
    });

    if (companiesByKey.size >= cfg.maxCompanies) break;
  }

  return Array.from(companiesByKey.values());
}

function matchPocsToCompanies(
  discoveredCompanies: DiscoveredCompany[],
  pocItems: Record<string, unknown>[],
  cfg: FilterConfig,
): { resolvedLeads: ResolvedLead[]; skippedNoPoc: number } {
  const pocByDomain = new Map<
    string,
    { name: string; role: string; score: number }
  >();
  const pocByCompany = new Map<
    string,
    { name: string; role: string; score: number }
  >();

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

    const cleanRole = role.split(/\s+[|•·]\s+/)[0].trim() || role;
    const score = scoreSalesDecisionMaker(cleanRole);

    const contactDomain =
      extractDomain(p.company_domain) ??
      extractDomain(p.company_website) ??
      extractDomain(p.organization_website_url);

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

  const resolvedLeads: ResolvedLead[] = [];
  let skippedNoPoc = 0;

  for (const comp of discoveredCompanies) {
    const matched =
      (comp.domain ? pocByDomain.get(comp.domain) : undefined) ??
      pocByCompany.get(comp.normalizedCompany);

    let pocName: string | null = matched?.name ?? null;
    let pocRole: string | null = matched?.role ?? null;
    let source = `apify:${cfg.jobActorId}+${cfg.leadsActorId}`;

    if (
      !pocName &&
      comp.posterName &&
      !looksLikeExternalRecruiter(comp.posterRole)
    ) {
      pocName = comp.posterName;
      pocRole = comp.posterRole ?? "Hiring Manager";
      source = `apify:${cfg.jobActorId}:poster`;
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
      job_location: comp.jobLocation,
      job_url: comp.jobUrl,
      source,
    });
  }

  return { resolvedLeads, skippedNoPoc };
}

async function upsertLeads(
  resolvedLeads: ResolvedLead[],
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{ savedRows: Record<string, unknown>[]; newCount: number }> {
  if (resolvedLeads.length === 0) return { savedRows: [], newCount: 0 };
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("us_sales_hiring_leads")
    .upsert(resolvedLeads, {
      onConflict: "company,poc_name",
      ignoreDuplicates: false,
    })
    .select(
      "id, company, poc_name, poc_role, hiring_role, job_location, company_domain, created_at, updated_at",
    );

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  const newCount = rows.filter(
    (r) =>
      typeof r.created_at === "string" &&
      typeof r.updated_at === "string" &&
      r.created_at === r.updated_at,
  ).length;
  return { savedRows: rows, newCount };
}

function extractUsageUsd(resource: Record<string, unknown>): number {
  const raw = resource.usageTotalUsd;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

async function createRunLog(
  supabaseUrl: string,
  serviceRoleKey: string,
  params: {
    state: string;
    locationQuery: string;
    mode: "async" | "sync";
    dryRun: boolean;
    roles: string[];
    rowsPerRole: number;
    publishedAt: string;
    cfg: FilterConfig;
    expectedJobRuns: number;
  },
): Promise<string | null> {
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase
      .from("us_sales_hiring_leads_runs")
      .insert({
        state: params.state,
        location_query: params.locationQuery,
        mode: params.mode,
        dry_run: params.dryRun,
        status: "running",
        roles: params.roles,
        rows_per_role: params.rowsPerRole,
        published_at: params.publishedAt,
        min_employees: params.cfg.minEmployees,
        max_employees: params.cfg.maxEmployees,
        max_companies: params.cfg.maxCompanies,
        expected_job_runs: params.expectedJobRuns,
        job_actor_id: params.cfg.jobActorId,
        leads_actor_id: params.cfg.leadsActorId,
      })
      .select("id")
      .single();
    if (error) {
      console.error("Failed to create run log:", error.message);
      return null;
    }
    return (data?.id as string) ?? null;
  } catch (err) {
    console.error("Exception creating run log:", err);
    return null;
  }
}

async function setRunJobIds(
  supabaseUrl: string,
  serviceRoleKey: string,
  runLogId: string | null,
  jobRunIds: string[],
): Promise<void> {
  if (!runLogId || jobRunIds.length === 0) return;
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    await supabase
      .from("us_sales_hiring_leads_runs")
      .update({ apify_job_run_ids: jobRunIds.filter(Boolean) })
      .eq("id", runLogId);
  } catch (err) {
    console.error("Failed to store apify_job_run_ids:", err);
  }
}

async function recordRunProgress(
  supabaseUrl: string,
  serviceRoleKey: string,
  runLogId: string | null,
  deltas: {
    completedJobRuns?: number;
    expectedPocRuns?: number;
    completedPocRuns?: number;
    jobsScraped?: number;
    companiesDiscovered?: number;
    pocItemsFetched?: number;
    leadsFound?: number;
    leadsSaved?: number;
    leadsNew?: number;
    skippedNoPoc?: number;
    apifyCostUsd?: number;
    pocRunId?: string | null;
    errorMessage?: string | null;
    forceComplete?: boolean;
  },
): Promise<void> {
  if (!runLogId) return;
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { error } = await supabase.rpc("record_us_sales_run_progress", {
      p_run_id: runLogId,
      p_completed_job_runs_delta: deltas.completedJobRuns ?? 0,
      p_expected_poc_runs_delta: deltas.expectedPocRuns ?? 0,
      p_completed_poc_runs_delta: deltas.completedPocRuns ?? 0,
      p_jobs_scraped_delta: deltas.jobsScraped ?? 0,
      p_companies_discovered_delta: deltas.companiesDiscovered ?? 0,
      p_poc_items_fetched_delta: deltas.pocItemsFetched ?? 0,
      p_leads_found_delta: deltas.leadsFound ?? 0,
      p_leads_saved_delta: deltas.leadsSaved ?? 0,
      p_leads_new_delta: deltas.leadsNew ?? 0,
      p_skipped_no_poc_delta: deltas.skippedNoPoc ?? 0,
      p_apify_cost_usd_delta: deltas.apifyCostUsd ?? 0,
      p_poc_run_id: deltas.pocRunId ?? null,
      p_error_message: deltas.errorMessage ?? null,
      p_force_complete: deltas.forceComplete ?? false,
    });
    if (error) {
      console.error("record_us_sales_run_progress RPC failed:", error.message);
    }
  } catch (err) {
    console.error("Exception in recordRunProgress:", err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const apifyToken =
    Deno.env.get("APIFY_TOKEN") ?? Deno.env.get("APIFY_API_TOKEN") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (req.method === "GET") {
    return jsonResponse({
      ok: true,
      function: "us-sales-hiring-leads",
      table: "public.us_sales_hiring_leads",
      runs_table: "public.us_sales_hiring_leads_runs",
      country: TARGET_COUNTRY,
      default_mode: "async",
      has_apify_token: Boolean(apifyToken),
      default_job_actor: DEFAULT_JOB_ACTOR_ID,
      default_leads_actor: DEFAULT_LEADS_ACTOR_ID,
      default_roles: DEFAULT_SALES_ROLES,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use GET or POST." }, 405);
  }

  if (!apifyToken || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: "Missing APIFY_TOKEN, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY." },
      500,
    );
  }

  const urlObj = new URL(req.url);
  const stage = urlObj.searchParams.get("stage");
  const selfUrl = `${supabaseUrl}/functions/v1/us-sales-hiring-leads`;
  const webhookAuthKey = supabaseAnonKey || serviceRoleKey;
  const webhookHeaders = JSON.stringify({
    Authorization: `Bearer ${webhookAuthKey}`,
    apikey: webhookAuthKey,
  });

  let rawBody: Record<string, unknown> = {};
  try {
    const rawText = await req.text();
    if (rawText.trim()) {
      rawBody = JSON.parse(rawText) as Record<string, unknown>;
    }
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  try {
    // =========================================================================
    // WEBHOOK STAGE 1 CALLBACK: jobs_done -> filter SMBs -> launch POC actor
    // =========================================================================
    if (stage === "jobs_done") {
      const resource = (rawBody.resource ?? {}) as Record<string, unknown>;
      const runStatus = asNonEmptyString(resource.status) ?? "SUCCEEDED";
      const runLogId = asNonEmptyString(rawBody.runLogId);
      const jobsDatasetId =
        asNonEmptyString(resource.defaultDatasetId) ??
        asNonEmptyString(rawBody.jobsDatasetId);
      const searchedRole = asNonEmptyString(rawBody.searchedRole) ?? "SDR";
      const cfg = (rawBody.config ?? {}) as FilterConfig;
      const usageUsd = extractUsageUsd(resource);

      if (runStatus !== "SUCCEEDED") {
        await recordRunProgress(supabaseUrl, serviceRoleKey, runLogId, {
          completedJobRuns: 1,
          apifyCostUsd: usageUsd,
          errorMessage: `jobs_done (${searchedRole}): Apify run ${String(resource.id ?? "")} ended with status ${runStatus}`,
        });
        return jsonResponse({
          ok: false,
          stage: "jobs_done",
          run_log_id: runLogId,
          apify_status: runStatus,
        });
      }

      if (!jobsDatasetId) {
        await recordRunProgress(supabaseUrl, serviceRoleKey, runLogId, {
          completedJobRuns: 1,
          apifyCostUsd: usageUsd,
          errorMessage: `jobs_done (${searchedRole}): Missing jobsDatasetId`,
        });
        return jsonResponse({ ok: false, error: "Missing jobsDatasetId" }, 400);
      }

      const jobItems = await fetchApifyDatasetItems(jobsDatasetId, apifyToken);
      const discovered = extractDiscoveredCompanies(jobItems, searchedRole, cfg);

      if (discovered.length === 0) {
        await recordRunProgress(supabaseUrl, serviceRoleKey, runLogId, {
          completedJobRuns: 1,
          jobsScraped: jobItems.length,
          companiesDiscovered: 0,
          apifyCostUsd: usageUsd,
        });
        return jsonResponse({
          ok: true,
          stage: "jobs_done",
          run_log_id: runLogId,
          jobs_scraped: jobItems.length,
          companies_discovered: 0,
        });
      }

      const isDeepmine = cfg.leadsActorId.toLowerCase().includes("deepmine");
      const domains = discovered
        .map((c) => c.domain)
        .filter((d): d is string => Boolean(d));

      const pocInput = isDeepmine
        ? {
            companies: discovered.map((c) => c.company),
            maxResults: 5,
            seniorityLevels: DEFAULT_DEEPMINE_SENIORITY,
            enrichProfiles: false,
            maxResultsTotal: Math.min(discovered.length * 5, 150),
            proxyConfiguration: { useApifyProxy: true },
          }
        : {
            company_domain: domains,
            contact_job_title: cfg.targetPocTitles,
            fetch_count: Math.min(domains.length * 4, 150),
          };

      // Note: payloadTemplate stays tiny by passing only runLogId + jobsDatasetId + config
      const payloadTemplate = `{
        "runLogId": ${JSON.stringify(runLogId)},
        "jobsDatasetId": ${JSON.stringify(jobsDatasetId)},
        "searchedRole": ${JSON.stringify(searchedRole)},
        "config": ${JSON.stringify(cfg)},
        "resource": {{resource}}
      }`;

      const pocRun = await startApifyActorAsync(
        cfg.leadsActorId,
        pocInput,
        apifyToken,
        {
          requestUrl: `${selfUrl}?stage=pocs_done`,
          headersTemplate: webhookHeaders,
          payloadTemplate,
        },
      );

      await recordRunProgress(supabaseUrl, serviceRoleKey, runLogId, {
        completedJobRuns: 1,
        expectedPocRuns: 1,
        jobsScraped: jobItems.length,
        companiesDiscovered: discovered.length,
        apifyCostUsd: usageUsd,
        pocRunId: pocRun.runId,
      });

      return jsonResponse({
        ok: true,
        stage: "jobs_done",
        run_log_id: runLogId,
        jobs_scraped: jobItems.length,
        companies_discovered: discovered.length,
        poc_run_id: pocRun.runId,
      });
    }

    // =========================================================================
    // WEBHOOK STAGE 2 CALLBACK: pocs_done -> match POCs -> upsert into Supabase
    // =========================================================================
    if (stage === "pocs_done") {
      const resource = (rawBody.resource ?? {}) as Record<string, unknown>;
      const runStatus = asNonEmptyString(resource.status) ?? "SUCCEEDED";
      const runLogId = asNonEmptyString(rawBody.runLogId);
      const pocsDatasetId =
        asNonEmptyString(resource.defaultDatasetId) ??
        asNonEmptyString(rawBody.pocsDatasetId);
      const jobsDatasetId = asNonEmptyString(rawBody.jobsDatasetId);
      const searchedRole = asNonEmptyString(rawBody.searchedRole) ?? "SDR";
      const cfg = (rawBody.config ?? {}) as FilterConfig;
      const usageUsd = extractUsageUsd(resource);

      if (runStatus !== "SUCCEEDED") {
        await recordRunProgress(supabaseUrl, serviceRoleKey, runLogId, {
          completedPocRuns: 1,
          apifyCostUsd: usageUsd,
          errorMessage: `pocs_done (${searchedRole}): Apify run ${String(resource.id ?? "")} ended with status ${runStatus}`,
        });
        return jsonResponse({
          ok: false,
          stage: "pocs_done",
          run_log_id: runLogId,
          apify_status: runStatus,
        });
      }

      if (!jobsDatasetId || !pocsDatasetId) {
        await recordRunProgress(supabaseUrl, serviceRoleKey, runLogId, {
          completedPocRuns: 1,
          apifyCostUsd: usageUsd,
          errorMessage: `pocs_done (${searchedRole}): Missing jobsDatasetId or pocsDatasetId`,
        });
        return jsonResponse(
          { ok: false, error: "Missing jobsDatasetId or pocsDatasetId" },
          400,
        );
      }

      const [jobItems, pocItems] = await Promise.all([
        fetchApifyDatasetItems(jobsDatasetId, apifyToken),
        fetchApifyDatasetItems(pocsDatasetId, apifyToken),
      ]);

      const discovered = extractDiscoveredCompanies(jobItems, searchedRole, cfg);
      const { resolvedLeads, skippedNoPoc } = matchPocsToCompanies(
        discovered,
        pocItems,
        cfg,
      );

      const { savedRows, newCount } = cfg.dryRun
        ? { savedRows: [], newCount: 0 }
        : await upsertLeads(resolvedLeads, supabaseUrl, serviceRoleKey);

      await recordRunProgress(supabaseUrl, serviceRoleKey, runLogId, {
        completedPocRuns: 1,
        pocItemsFetched: pocItems.length,
        leadsFound: resolvedLeads.length,
        leadsSaved: savedRows.length,
        leadsNew: newCount,
        skippedNoPoc,
        apifyCostUsd: usageUsd,
      });

      return jsonResponse({
        ok: true,
        stage: "pocs_done",
        run_log_id: runLogId,
        companies_discovered: discovered.length,
        poc_items_fetched: pocItems.length,
        leads_resolved: resolvedLeads.length,
        saved_count: savedRows.length,
        new_count: newCount,
        skipped_no_poc: skippedNoPoc,
      });
    }

    // =========================================================================
    // TRIGGER ENDPOINT (default mode = "async", optional mode = "sync")
    // =========================================================================
    const body = rawBody as RequestPayload;
    const mode = body.mode === "sync" ? "sync" : "async";

    const roles =
      Array.isArray(body.roles) && body.roles.length > 0
        ? body.roles.map((r) => String(r).trim()).filter(Boolean)
        : DEFAULT_SALES_ROLES;

    const rawUsLoc = asNonEmptyString(body.usLocation);
    const stateLabel = rawUsLoc
      ? rawUsLoc.replace(/,\s*(united states|usa|us)\s*$/i, "").trim() || rawUsLoc
      : TARGET_COUNTRY;
    const location = rawUsLoc
      ? /united states|\busa\b|\bus\b/i.test(rawUsLoc)
        ? rawUsLoc
        : `${rawUsLoc}, United States`
      : TARGET_COUNTRY;

    const rowsPerRole = Math.min(
      Math.max(Number(body.rowsPerRole ?? (mode === "async" ? 100 : 20)), 1),
      200,
    );
    const publishedAt = asNonEmptyString(body.publishedAt) ?? "r604800";

    const cfg: FilterConfig = {
      minEmployees: Math.max(Number(body.minEmployees ?? 5), 1),
      maxEmployees: Math.max(Number(body.maxEmployees ?? 100), 5),
      includeUnknownSize: body.includeUnknownSize ?? false,
      maxCompanies: Math.min(Math.max(Number(body.maxCompanies ?? 30), 1), 60),
      targetPocTitles:
        Array.isArray(body.targetPocTitles) && body.targetPocTitles.length > 0
          ? body.targetPocTitles.map((t) => String(t).trim()).filter(Boolean)
          : DEFAULT_POC_TITLES,
      jobActorId: asNonEmptyString(body.jobActorId) ?? DEFAULT_JOB_ACTOR_ID,
      leadsActorId: asNonEmptyString(body.leadsActorId) ?? DEFAULT_LEADS_ACTOR_ID,
      dryRun: Boolean(body.dryRun),
    };

    const runLogId = await createRunLog(supabaseUrl, serviceRoleKey, {
      state: stateLabel,
      locationQuery: location,
      mode,
      dryRun: cfg.dryRun,
      roles,
      rowsPerRole,
      publishedAt,
      cfg,
      expectedJobRuns: roles.length,
    });

    if (mode === "async") {
      let startedRuns;
      try {
        startedRuns = await Promise.all(
          roles.map(async (role) => {
            const payloadTemplate = `{
              "runLogId": ${JSON.stringify(runLogId)},
              "searchedRole": ${JSON.stringify(role)},
              "config": ${JSON.stringify(cfg)},
              "resource": {{resource}}
            }`;

            const started = await startApifyActorAsync(
              cfg.jobActorId,
              {
                title: role,
                location,
                rows: rowsPerRole,
                publishedAt,
              },
              apifyToken,
              {
                requestUrl: `${selfUrl}?stage=jobs_done`,
                headersTemplate: webhookHeaders,
                payloadTemplate,
              },
            );
            return { role, location, rows: rowsPerRole, ...started };
          }),
        );
      } catch (startErr) {
        await recordRunProgress(supabaseUrl, serviceRoleKey, runLogId, {
          errorMessage: startErr instanceof Error ? startErr.message : String(startErr),
          forceComplete: true,
        });
        throw startErr;
      }

      await setRunJobIds(
        supabaseUrl,
        serviceRoleKey,
        runLogId,
        startedRuns.map((r) => r.runId),
      );

      return jsonResponse(
        {
          ok: true,
          mode: "async",
          run_log_id: runLogId,
          state: stateLabel,
          message:
            "Started async Apify job scrapes. Results will automatically flow through jobs_done -> pocs_done and upsert into public.us_sales_hiring_leads.",
          location,
          config: cfg,
          started_runs: startedRuns,
        },
        202,
      );
    }

    // Synchronous fallback mode (small quick runs)
    const jobRuns = await Promise.allSettled(
      roles.map((role) =>
        runApifyActorSync(
          cfg.jobActorId,
          { title: role, location, rows: rowsPerRole, publishedAt },
          apifyToken,
          80,
        ).then((items) => ({ role, items }))
      ),
    );

    const jobErrors: string[] = [];
    const allCompaniesMap = new Map<string, DiscoveredCompany>();
    let totalJobsScraped = 0;

    for (const r of jobRuns) {
      if (r.status === "rejected") {
        jobErrors.push(String(r.reason));
        continue;
      }
      totalJobsScraped += r.value.items.length;
      const discovered = extractDiscoveredCompanies(r.value.items, r.value.role, cfg);
      for (const c of discovered) {
        const key = c.domain ?? c.normalizedCompany;
        if (!allCompaniesMap.has(key) && allCompaniesMap.size < cfg.maxCompanies) {
          allCompaniesMap.set(key, c);
        }
      }
    }

    const discoveredCompanies = Array.from(allCompaniesMap.values());
    if (discoveredCompanies.length === 0) {
      await recordRunProgress(supabaseUrl, serviceRoleKey, runLogId, {
        completedJobRuns: roles.length,
        jobsScraped: totalJobsScraped,
        companiesDiscovered: 0,
        errorMessage: jobErrors.length > 0 ? jobErrors.join(" | ") : null,
        forceComplete: true,
      });
      return jsonResponse({
        ok: true,
        mode: "sync",
        run_log_id: runLogId,
        state: stateLabel,
        dry_run: cfg.dryRun,
        location,
        jobs_scraped: totalJobsScraped,
        companies_discovered: 0,
        saved_count: 0,
        new_count: 0,
        job_errors: jobErrors,
        leads: [],
      });
    }

    const isDeepmine = cfg.leadsActorId.toLowerCase().includes("deepmine");
    const domains = discoveredCompanies
      .map((c) => c.domain)
      .filter((d): d is string => Boolean(d));

    const pocErrors: string[] = [];
    let pocItems: Record<string, unknown>[] = [];
    try {
      pocItems = await runApifyActorSync(
        cfg.leadsActorId,
        isDeepmine
          ? {
              companies: discoveredCompanies.map((c) => c.company),
              maxResults: 5,
              seniorityLevels: DEFAULT_DEEPMINE_SENIORITY,
              enrichProfiles: false,
              maxResultsTotal: Math.min(discoveredCompanies.length * 5, 100),
              proxyConfiguration: { useApifyProxy: true },
            }
          : {
              company_domain: domains,
              contact_job_title: cfg.targetPocTitles,
              fetch_count: Math.min(domains.length * 4, 100),
            },
        apifyToken,
        100,
      );
    } catch (err) {
      pocErrors.push(String(err));
    }

    const { resolvedLeads, skippedNoPoc } = matchPocsToCompanies(
      discoveredCompanies,
      pocItems,
      cfg,
    );

    const { savedRows, newCount } = cfg.dryRun
      ? { savedRows: [], newCount: 0 }
      : await upsertLeads(resolvedLeads, supabaseUrl, serviceRoleKey);

    const allErrors = [...jobErrors, ...pocErrors];
    await recordRunProgress(supabaseUrl, serviceRoleKey, runLogId, {
      completedJobRuns: roles.length,
      expectedPocRuns: 1,
      completedPocRuns: 1,
      jobsScraped: totalJobsScraped,
      companiesDiscovered: discoveredCompanies.length,
      pocItemsFetched: pocItems.length,
      leadsFound: resolvedLeads.length,
      leadsSaved: savedRows.length,
      leadsNew: newCount,
      skippedNoPoc,
      errorMessage: allErrors.length > 0 ? allErrors.join(" | ") : null,
      forceComplete: true,
    });

    return jsonResponse({
      ok: true,
      mode: "sync",
      run_log_id: runLogId,
      state: stateLabel,
      dry_run: cfg.dryRun,
      location,
      jobs_scraped: totalJobsScraped,
      companies_discovered: discoveredCompanies.length,
      leads_resolved: resolvedLeads.length,
      saved_count: savedRows.length,
      new_count: newCount,
      skipped_no_poc: skippedNoPoc,
      job_errors: jobErrors,
      poc_errors: pocErrors,
      leads: cfg.dryRun ? resolvedLeads : savedRows,
    });
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        stage: stage ?? "trigger",
        error: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});

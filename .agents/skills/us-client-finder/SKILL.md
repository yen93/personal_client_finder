---
name: us-client-finder
description: >-
  Trigger, monitor, and inspect leads from the US Client Finder Supabase Edge
  Function (`us-sales-hiring-leads` on project `uwsncuowtzydylfabikj`).
  Activate when the user invokes `/us-client-finder` or asks to run the US
  client finder, scrape US SMB outbound sales hiring leads, or check newly
  discovered leads in `public.us_sales_hiring_leads`.
---

# US Client Finder (`/us-client-finder`)

Runs the live `us-sales-hiring-leads` Supabase Edge Function (v3, async Apify webhook pipeline) to discover US SMBs (5–100 employees) actively hiring outbound sales / SDR / BDR / lead-gen roles, resolve one executive or sales decision-maker per company, and upsert them into `public.us_sales_hiring_leads`.

- **Endpoint:** `https://uwsncuowtzydylfabikj.supabase.co/functions/v1/us-sales-hiring-leads`
- **Target Table:** `public.us_sales_hiring_leads` (upsert key: `(company, poc_name)`)
- **Helper Script:** [run_us_client_finder.py](./scripts/run_us_client_finder.py)

---

## Security & Cost Guardrails

1. **Zero Hardcoded Secrets:** The helper script resolves `SUPABASE_ACCESS_TOKEN` from the environment or `C:\Users\Cloverly\Downloads\SUPABASE_ACCESS_TOKEN.txt`, fetches the project `anon` key dynamically via the Supabase Management API, and never prints tokens.
2. **Apify Spend Awareness:** The Apify account has a `$19.00/mo` spend cap.
   - `bebity~linkedin-jobs-scraper` costs ~$0.00125/job (~84% of spend); `deepmine~linkedin-company-employees` accounts for ~16%.
   - 1 US state × 4 default roles × `rowsPerRole=75` (300 jobs) costs **~$0.35–$0.45 USD**.
   - Avoid launching more than 2–3 states in a single invocation unless the user explicitly asks for a larger batch.
3. **Prefer State-Level Runs Over Nationwide:** Nationwide `"United States"` scrapes are enterprise-heavy (lower SMB yield per dollar). When the user doesn't specify a location, inspect existing `job_location` coverage first and pick an unscraped high-SMB US state (e.g., `Illinois`, `Georgia`, `Colorado`, `North Carolina`, `Massachusetts`, `Arizona`, `Washington`, `Virginia`, `Pennsylvania`, `Tennessee`, `Ohio`).
4. **Always Use `async` Mode for Normal Runs:** `mode="async"` (default) returns HTTP `202` in ~2–3 seconds and chains `?stage=jobs_done` → `?stage=pocs_done` via Apify webhooks, avoiding Supabase's 150-second HTTP gateway timeout. Reserve `--mode sync` only for tiny tests (`--rows-per-role 10 --max-companies 5`).

---

## Step-by-Step Workflow

> **Execution note:** Network requests to `supabase.co` / `api.supabase.com` and reading `~/Downloads/SUPABASE_ACCESS_TOKEN.txt` require running outside the sandbox (`BypassSandbox: true`).

### Step 1: Check Current Table State (Read-Only)
Before spending Apify credits, inspect current row counts and already-covered US locations:

```powershell
python .agents/skills/us-client-finder/scripts/run_us_client_finder.py --status-only
```

### Step 2: Trigger the Edge Function
Run one or more US states (repeat `--location` for multiple states). Adjust `--rows-per-role` (recommended `50`–`100`) and `--roles` if the user specified custom roles.

```powershell
python .agents/skills/us-client-finder/scripts/run_us_client_finder.py --location "Illinois" --rows-per-role 75
```

Common options:
- Multiple states: `--location "Georgia" --location "Colorado" --rows-per-role 60`
- Custom roles: `--roles "Sales Development Representative,Business Development Representative"`
- Last 24 hours only: `--published-at r86400`
- Dry run (no DB writes): `--dry-run`
- Small synchronous smoke test: `--mode sync --location "Colorado" --rows-per-role 10 --max-companies 5`

Confirm the JSON response contains `"ok": true`, `"http_status": 202`, and a non-empty `started_runs` array with Apify `runId` and `datasetId` values. Note `started_at_utc` from the output.

### Step 3: Verify New Leads in Supabase
Async runs take **~2–4 minutes** to complete both Apify stages (`bebity` → `jobs_done` → `deepmine` → `pocs_done`). Either pass `--wait-seconds 240` on Step 2, or wait ~2–3 minutes and query all leads created/updated since `started_at_utc`:

```powershell
python .agents/skills/us-client-finder/scripts/run_us_client_finder.py --since "<started_at_utc>"
```

### Step 4: Report Results to the User
Summarize concisely:
1. Location(s), roles, `rowsPerRole`, and `started_runs` Apify run IDs.
2. Before/after row counts in `public.us_sales_hiring_leads`.
3. A clean markdown table of newly discovered/updated leads (`Company`, `POC Name`, `POC Role`, `Domain`, `Hiring Role`, `Location`) once webhooks complete (or note that the async Apify webhooks are in progress and give the `--since` check command if returning immediately).

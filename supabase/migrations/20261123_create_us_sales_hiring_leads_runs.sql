-- Migration: Create us_sales_hiring_leads_runs table + atomic progress RPC
-- Logs every invocation of the us-sales-hiring-leads Edge Function (async & sync),
-- including requested US state, filter config, funnel metrics, Apify spend, and completion status.

CREATE TABLE IF NOT EXISTS public.us_sales_hiring_leads_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  location_query text NOT NULL,
  mode text NOT NULL DEFAULT 'async',
  dry_run boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'running',
  roles text[] NOT NULL DEFAULT '{}',
  rows_per_role integer NOT NULL,
  published_at text NOT NULL,
  min_employees integer NOT NULL,
  max_employees integer NOT NULL,
  max_companies integer NOT NULL,
  expected_job_runs integer NOT NULL DEFAULT 0,
  completed_job_runs integer NOT NULL DEFAULT 0,
  expected_poc_runs integer NOT NULL DEFAULT 0,
  completed_poc_runs integer NOT NULL DEFAULT 0,
  jobs_scraped integer NOT NULL DEFAULT 0,
  companies_discovered integer NOT NULL DEFAULT 0,
  poc_items_fetched integer NOT NULL DEFAULT 0,
  leads_found integer NOT NULL DEFAULT 0,
  leads_saved integer NOT NULL DEFAULT 0,
  leads_new integer NOT NULL DEFAULT 0,
  skipped_no_poc integer NOT NULL DEFAULT 0,
  apify_cost_usd numeric(10, 5) NOT NULL DEFAULT 0,
  job_actor_id text NOT NULL,
  leads_actor_id text NOT NULL,
  apify_job_run_ids text[] NOT NULL DEFAULT '{}',
  apify_poc_run_ids text[] NOT NULL DEFAULT '{}',
  error_messages text[] NOT NULL DEFAULT '{}',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_us_sales_hiring_leads_runs_state_started
  ON public.us_sales_hiring_leads_runs (state, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_us_sales_hiring_leads_runs_started_at
  ON public.us_sales_hiring_leads_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_us_sales_hiring_leads_runs_status
  ON public.us_sales_hiring_leads_runs (status);

CREATE OR REPLACE FUNCTION public.set_us_sales_hiring_leads_runs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_us_sales_hiring_leads_runs_updated_at ON public.us_sales_hiring_leads_runs;
CREATE TRIGGER trg_us_sales_hiring_leads_runs_updated_at
  BEFORE UPDATE ON public.us_sales_hiring_leads_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_us_sales_hiring_leads_runs_updated_at();

-- Atomic progress updater for concurrent async Apify webhook callbacks (jobs_done / pocs_done)
-- and synchronous run finalization. Automatically transitions status to completed / completed_with_errors
-- once all expected job runs and POC runs have reported back.
CREATE OR REPLACE FUNCTION public.record_us_sales_run_progress(
  p_run_id uuid,
  p_completed_job_runs_delta integer DEFAULT 0,
  p_expected_poc_runs_delta integer DEFAULT 0,
  p_completed_poc_runs_delta integer DEFAULT 0,
  p_jobs_scraped_delta integer DEFAULT 0,
  p_companies_discovered_delta integer DEFAULT 0,
  p_poc_items_fetched_delta integer DEFAULT 0,
  p_leads_found_delta integer DEFAULT 0,
  p_leads_saved_delta integer DEFAULT 0,
  p_leads_new_delta integer DEFAULT 0,
  p_skipped_no_poc_delta integer DEFAULT 0,
  p_apify_cost_usd_delta numeric DEFAULT 0,
  p_poc_run_id text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_force_complete boolean DEFAULT false
)
RETURNS public.us_sales_hiring_leads_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.us_sales_hiring_leads_runs;
  v_done boolean;
  v_has_errors boolean;
BEGIN
  UPDATE public.us_sales_hiring_leads_runs
  SET
    completed_job_runs = completed_job_runs + COALESCE(p_completed_job_runs_delta, 0),
    expected_poc_runs = expected_poc_runs + COALESCE(p_expected_poc_runs_delta, 0),
    completed_poc_runs = completed_poc_runs + COALESCE(p_completed_poc_runs_delta, 0),
    jobs_scraped = jobs_scraped + COALESCE(p_jobs_scraped_delta, 0),
    companies_discovered = companies_discovered + COALESCE(p_companies_discovered_delta, 0),
    poc_items_fetched = poc_items_fetched + COALESCE(p_poc_items_fetched_delta, 0),
    leads_found = leads_found + COALESCE(p_leads_found_delta, 0),
    leads_saved = leads_saved + COALESCE(p_leads_saved_delta, 0),
    leads_new = leads_new + COALESCE(p_leads_new_delta, 0),
    skipped_no_poc = skipped_no_poc + COALESCE(p_skipped_no_poc_delta, 0),
    apify_cost_usd = apify_cost_usd + COALESCE(p_apify_cost_usd_delta, 0),
    apify_poc_run_ids = CASE
      WHEN p_poc_run_id IS NOT NULL AND p_poc_run_id <> ''
      THEN array_append(apify_poc_run_ids, p_poc_run_id)
      ELSE apify_poc_run_ids
    END,
    error_messages = CASE
      WHEN p_error_message IS NOT NULL AND p_error_message <> ''
      THEN array_append(error_messages, p_error_message)
      ELSE error_messages
    END
  WHERE id = p_run_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_done := p_force_complete
    OR (
      v_row.completed_job_runs >= v_row.expected_job_runs
      AND v_row.completed_poc_runs >= v_row.expected_poc_runs
    );

  IF v_done THEN
    v_has_errors := COALESCE(array_length(v_row.error_messages, 1), 0) > 0;
    UPDATE public.us_sales_hiring_leads_runs
    SET
      status = CASE
        WHEN v_has_errors AND v_row.leads_found = 0 AND v_row.jobs_scraped = 0 THEN 'failed'
        WHEN v_has_errors THEN 'completed_with_errors'
        ELSE 'completed'
      END,
      completed_at = COALESCE(completed_at, now()),
      duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(completed_at, now()) - started_at))::integer)
    WHERE id = p_run_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

-- Lock down public anon access; service_role (Edge Functions) bypasses RLS automatically.
ALTER TABLE public.us_sales_hiring_leads_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON FUNCTION public.record_us_sales_run_progress FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_us_sales_run_progress TO service_role;

-- Migration: Create hiring_signal_leads table for #1 buying signal (companies actively hiring admin/ops/sales roles)
-- Upsert-only convention: deduplicated by (company, poc_name)

CREATE TABLE IF NOT EXISTS public.hiring_signal_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company text NOT NULL,
  poc_name text NOT NULL,
  poc_role text NOT NULL,
  company_domain text,
  hiring_role text,
  job_url text,
  source text NOT NULL DEFAULT 'apify_linkedin_jobs',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hiring_signal_leads_company_poc_unique UNIQUE (company, poc_name)
);

CREATE INDEX IF NOT EXISTS idx_hiring_signal_leads_company
  ON public.hiring_signal_leads (company);

CREATE INDEX IF NOT EXISTS idx_hiring_signal_leads_created_at
  ON public.hiring_signal_leads (created_at DESC);

CREATE OR REPLACE FUNCTION public.set_hiring_signal_leads_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hiring_signal_leads_updated_at ON public.hiring_signal_leads;
CREATE TRIGGER trg_hiring_signal_leads_updated_at
  BEFORE UPDATE ON public.hiring_signal_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_hiring_signal_leads_updated_at();

-- Lock down public anon access; service_role (Edge Functions / n8n) bypasses RLS automatically.
ALTER TABLE public.hiring_signal_leads ENABLE ROW LEVEL SECURITY;

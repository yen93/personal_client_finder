-- Migration: Create us_sales_hiring_leads table (US-only, sales-related hiring signal)
-- Upsert-only convention: deduplicated by (company, poc_name)

CREATE TABLE IF NOT EXISTS public.us_sales_hiring_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company text NOT NULL,
  poc_name text NOT NULL,
  poc_role text NOT NULL,
  company_domain text,
  hiring_role text,
  job_location text,
  job_url text,
  source text NOT NULL DEFAULT 'apify_us_sales_jobs',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT us_sales_hiring_leads_company_poc_unique UNIQUE (company, poc_name)
);

CREATE INDEX IF NOT EXISTS idx_us_sales_hiring_leads_company
  ON public.us_sales_hiring_leads (company);

CREATE INDEX IF NOT EXISTS idx_us_sales_hiring_leads_created_at
  ON public.us_sales_hiring_leads (created_at DESC);

CREATE OR REPLACE FUNCTION public.set_us_sales_hiring_leads_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_us_sales_hiring_leads_updated_at ON public.us_sales_hiring_leads;
CREATE TRIGGER trg_us_sales_hiring_leads_updated_at
  BEFORE UPDATE ON public.us_sales_hiring_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_us_sales_hiring_leads_updated_at();

-- Lock down public anon access; service_role (Edge Functions / n8n) bypasses RLS automatically.
ALTER TABLE public.us_sales_hiring_leads ENABLE ROW LEVEL SECURITY;

-- Migration: Create autodoc_customer_emails table from list.csv

CREATE TABLE IF NOT EXISTS public.autodoc_customer_emails (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auto_doc_asset_id bigint NOT NULL,
  nav_customer_id text NOT NULL,
  name text NOT NULL,
  email text,
  silo_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autodoc_customer_emails_auto_doc_asset_id
  ON public.autodoc_customer_emails (auto_doc_asset_id);

CREATE INDEX IF NOT EXISTS idx_autodoc_customer_emails_nav_customer_id
  ON public.autodoc_customer_emails (nav_customer_id);

CREATE INDEX IF NOT EXISTS idx_autodoc_customer_emails_email
  ON public.autodoc_customer_emails (email)
  WHERE email IS NOT NULL;

-- Lock down public anon access; service_role bypasses RLS automatically.
ALTER TABLE public.autodoc_customer_emails ENABLE ROW LEVEL SECURITY;

-- Migration: Document enrichment & Gmail draft tracking columns on autodoc_customer_emails
-- and add a partial queue index for fast undrafted lead selection.

ALTER TABLE public.autodoc_customer_emails
  ADD COLUMN IF NOT EXISTS approx_employee_count integer,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS drafted_at timestamptz,
  ADD COLUMN IF NOT EXISTS gmail_draft_id text;

CREATE INDEX IF NOT EXISTS idx_autodoc_customer_emails_draft_queue
  ON public.autodoc_customer_emails (id)
  WHERE email IS NOT NULL AND drafted_at IS NULL;

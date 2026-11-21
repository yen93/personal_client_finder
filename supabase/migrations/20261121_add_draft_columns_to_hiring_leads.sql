-- Migration: Add Gmail draft tracking columns to hiring lead tables
-- Keeps public.us_sales_hiring_leads and public.au_hiring_signal_leads schema-aligned
-- Prevents duplicate Gmail drafts on re-runs while keeping sent_intro_at NULL until actually sent

ALTER TABLE public.us_sales_hiring_leads
  ADD COLUMN IF NOT EXISTS drafted_at timestamptz,
  ADD COLUMN IF NOT EXISTS gmail_draft_id text;

ALTER TABLE public.au_hiring_signal_leads
  ADD COLUMN IF NOT EXISTS drafted_at timestamptz,
  ADD COLUMN IF NOT EXISTS gmail_draft_id text;

CREATE INDEX IF NOT EXISTS idx_us_sales_hiring_leads_draft_queue
  ON public.us_sales_hiring_leads (enrichment_id, drafted_at, sent_intro_at)
  WHERE enrichment_id = 1 AND sent_intro_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_au_hiring_signal_leads_draft_queue
  ON public.au_hiring_signal_leads (enrichment_id, drafted_at, sent_intro_at)
  WHERE enrichment_id = 1 AND sent_intro_at IS NULL;

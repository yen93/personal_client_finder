-- Migration: Ensure sent_intro_at and add thread_id to hiring lead tables
-- Populated by send-drafted-emails Edge Function upon Gmail drafts.send

ALTER TABLE public.us_sales_hiring_leads
  ADD COLUMN IF NOT EXISTS sent_intro_at timestamptz,
  ADD COLUMN IF NOT EXISTS thread_id text;

ALTER TABLE public.au_hiring_signal_leads
  ADD COLUMN IF NOT EXISTS sent_intro_at timestamptz,
  ADD COLUMN IF NOT EXISTS thread_id text;

CREATE INDEX IF NOT EXISTS idx_us_sales_hiring_leads_thread_id
  ON public.us_sales_hiring_leads (thread_id)
  WHERE thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_au_hiring_signal_leads_thread_id
  ON public.au_hiring_signal_leads (thread_id)
  WHERE thread_id IS NOT NULL;

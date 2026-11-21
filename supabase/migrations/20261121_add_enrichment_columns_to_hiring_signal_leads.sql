-- Migration: Mirror the 4 newest enrichment/outreach columns from
-- public.us_sales_hiring_leads onto public.hiring_signal_leads.

ALTER TABLE public.hiring_signal_leads
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_intro_at timestamptz,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS enrichment_id integer;

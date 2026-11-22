-- Migration: Create public.status lookup table and add status FK column to hiring lead tables

CREATE TABLE IF NOT EXISTS public.status (
  id integer PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  description text NOT NULL UNIQUE
);

INSERT INTO public.status (id, description) VALUES
  (1, 'new lead'),
  (2, 'enriched'),
  (3, 'intro drafted'),
  (4, 'intro sent'),
  (5, 'lead responded'),
  (6, 'intro bounced')
ON CONFLICT (id) DO UPDATE SET description = EXCLUDED.description;

ALTER TABLE public.status ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.us_sales_hiring_leads
  ADD COLUMN IF NOT EXISTS status integer NOT NULL DEFAULT 1 REFERENCES public.status(id);

ALTER TABLE public.au_hiring_signal_leads
  ADD COLUMN IF NOT EXISTS status integer NOT NULL DEFAULT 1 REFERENCES public.status(id);

CREATE INDEX IF NOT EXISTS idx_us_sales_hiring_leads_status
  ON public.us_sales_hiring_leads (status);

CREATE INDEX IF NOT EXISTS idx_au_hiring_signal_leads_status
  ON public.au_hiring_signal_leads (status);

-- Backfill current status for existing rows based on lifecycle timestamps
UPDATE public.us_sales_hiring_leads
SET status = CASE
  WHEN sent_intro_at IS NOT NULL THEN 4
  WHEN drafted_at IS NOT NULL THEN 3
  WHEN enrichment_id IS NOT NULL THEN 2
  ELSE 1
END
WHERE status = 1;

UPDATE public.au_hiring_signal_leads
SET status = CASE
  WHEN sent_intro_at IS NOT NULL THEN 4
  WHEN drafted_at IS NOT NULL THEN 3
  WHEN enrichment_id IS NOT NULL THEN 2
  ELSE 1
END
WHERE status = 1;

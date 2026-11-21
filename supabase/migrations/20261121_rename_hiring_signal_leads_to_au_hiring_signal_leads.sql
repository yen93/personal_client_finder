-- Migration: Rename public.hiring_signal_leads to public.au_hiring_signal_leads
-- along with its constraints, indexes, trigger, and trigger function.

ALTER TABLE public.hiring_signal_leads RENAME TO au_hiring_signal_leads;

ALTER TABLE public.au_hiring_signal_leads
  RENAME CONSTRAINT hiring_signal_leads_pkey TO au_hiring_signal_leads_pkey;

ALTER TABLE public.au_hiring_signal_leads
  RENAME CONSTRAINT hiring_signal_leads_company_poc_unique TO au_hiring_signal_leads_company_poc_unique;

ALTER INDEX public.idx_hiring_signal_leads_company
  RENAME TO idx_au_hiring_signal_leads_company;

ALTER INDEX public.idx_hiring_signal_leads_created_at
  RENAME TO idx_au_hiring_signal_leads_created_at;

ALTER FUNCTION public.set_hiring_signal_leads_updated_at()
  RENAME TO set_au_hiring_signal_leads_updated_at;

ALTER TRIGGER trg_hiring_signal_leads_updated_at
  ON public.au_hiring_signal_leads
  RENAME TO trg_au_hiring_signal_leads_updated_at;

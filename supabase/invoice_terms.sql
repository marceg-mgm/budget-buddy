-- =====================================================================
-- INVOICES — adds optional `terms` and `due_date` fields
-- Shown in the PDF header beside Invoice # and Date when set.
-- Run in Supabase SQL Editor. Idempotent.
-- =====================================================================

alter table public.invoices
  add column if not exists terms text,
  add column if not exists due_date date;

-- =====================================================================
-- INVOICE LINE ITEMS — adds a JSONB `items` column to invoices
-- Each item: { description: string, quantity: number, unit_price: number, tax_rate: number }
-- Run this in Supabase SQL Editor. Idempotent.
-- =====================================================================

alter table public.invoices
  add column if not exists items jsonb not null default '[]'::jsonb;

-- Optional: ensure shape is an array
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_items_is_array'
  ) then
    alter table public.invoices
      add constraint invoices_items_is_array
      check (jsonb_typeof(items) = 'array');
  end if;
end $$;

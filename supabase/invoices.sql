-- =====================================================================
-- INVOICES MODULE — tables, RLS, storage bucket "logos"
-- Run this in Supabase SQL Editor.
-- Idempotent.
-- =====================================================================

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  transaction_type text not null default 'Invoice',
  invoice_number text not null,
  client_name text not null,
  currency text not null default 'USD',
  amount numeric(14,2) not null check (amount >= 0),
  net_amount numeric(14,2) not null check (net_amount >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  status text not null default 'draft' check (status in ('draft','sent','paid')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists invoices_user_id_idx on public.invoices(user_id);
create index if not exists invoices_date_idx on public.invoices(date);
create index if not exists invoices_status_idx on public.invoices(status);
create unique index if not exists invoices_user_number_uniq
  on public.invoices(user_id, invoice_number);

create table if not exists public.user_profile_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  business_name text,
  business_email text,
  business_phone text,
  business_address text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoices enable row level security;
alter table public.user_profile_settings enable row level security;

drop policy if exists "invoices_select_own" on public.invoices;
create policy "invoices_select_own" on public.invoices
  for select using (auth.uid() = user_id);
drop policy if exists "invoices_insert_own" on public.invoices;
create policy "invoices_insert_own" on public.invoices
  for insert with check (auth.uid() = user_id);
drop policy if exists "invoices_update_own" on public.invoices;
create policy "invoices_update_own" on public.invoices
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "invoices_delete_own" on public.invoices;
create policy "invoices_delete_own" on public.invoices
  for delete using (auth.uid() = user_id);

drop policy if exists "ups_select_own" on public.user_profile_settings;
create policy "ups_select_own" on public.user_profile_settings
  for select using (auth.uid() = user_id);
drop policy if exists "ups_insert_own" on public.user_profile_settings;
create policy "ups_insert_own" on public.user_profile_settings
  for insert with check (auth.uid() = user_id);
drop policy if exists "ups_update_own" on public.user_profile_settings;
create policy "ups_update_own" on public.user_profile_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "ups_delete_own" on public.user_profile_settings;
create policy "ups_delete_own" on public.user_profile_settings
  for delete using (auth.uid() = user_id);

-- Storage bucket for logos (public-read so PDFs can embed)
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

drop policy if exists "logos_select_public" on storage.objects;
create policy "logos_select_public" on storage.objects
  for select using (bucket_id = 'logos');
drop policy if exists "logos_insert_own" on storage.objects;
create policy "logos_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
drop policy if exists "logos_update_own" on storage.objects;
create policy "logos_update_own" on storage.objects
  for update using (
    bucket_id = 'logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
drop policy if exists "logos_delete_own" on storage.objects;
create policy "logos_delete_own" on storage.objects
  for delete using (
    bucket_id = 'logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

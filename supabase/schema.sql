-- =====================================================================
-- EXPENSE TRACKER — FULL SCHEMA, RLS, STORAGE, TRIGGERS, SEEDS
-- Run this entire file in Supabase SQL Editor (one shot is fine).
-- Idempotent where possible.
-- =====================================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- =====================================================================
-- TABLES
-- =====================================================================

-- profiles -------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  currency text not null default 'CAD',
  created_at timestamptz not null default now()
);

-- categories -----------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade, -- null = global default
  name text not null,
  icon text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists categories_user_id_idx on public.categories(user_id);

-- per-user hidden default categories
create table if not exists public.hidden_default_categories (
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (user_id, category_id)
);

-- taxes ----------------------------------------------------------------
create table if not exists public.taxes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  rate numeric(7,4) not null check (rate >= 0),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists taxes_user_id_idx on public.taxes(user_id);

-- expenses -------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  category_id uuid references public.categories(id) on delete set null,
  description text,
  amount numeric(14,2) not null check (amount >= 0),
  taxes jsonb not null default '[]'::jsonb,
  tip_amount numeric(14,2) not null default 0 check (tip_amount >= 0),
  tip_percentage numeric(7,4),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  receipt_url text,
  created_at timestamptz not null default now()
);
create index if not exists expenses_user_id_idx on public.expenses(user_id);
create index if not exists expenses_date_idx on public.expenses(date);
create index if not exists expenses_category_idx on public.expenses(category_id);

-- =====================================================================
-- TRIGGER: create profile on signup
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.hidden_default_categories enable row level security;
alter table public.taxes enable row level security;
alter table public.expenses enable row level security;

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- categories: own rows + global defaults are readable by anyone authenticated
drop policy if exists "categories_select_own_or_default" on public.categories;
create policy "categories_select_own_or_default" on public.categories
  for select using (
    auth.uid() = user_id
    or (user_id is null and is_default = true)
  );

drop policy if exists "categories_insert_own" on public.categories;
create policy "categories_insert_own" on public.categories
  for insert with check (auth.uid() = user_id);

drop policy if exists "categories_update_own" on public.categories;
create policy "categories_update_own" on public.categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "categories_delete_own" on public.categories;
create policy "categories_delete_own" on public.categories
  for delete using (auth.uid() = user_id);

-- hidden_default_categories
drop policy if exists "hdc_select_own" on public.hidden_default_categories;
create policy "hdc_select_own" on public.hidden_default_categories
  for select using (auth.uid() = user_id);

drop policy if exists "hdc_insert_own" on public.hidden_default_categories;
create policy "hdc_insert_own" on public.hidden_default_categories
  for insert with check (auth.uid() = user_id);

drop policy if exists "hdc_delete_own" on public.hidden_default_categories;
create policy "hdc_delete_own" on public.hidden_default_categories
  for delete using (auth.uid() = user_id);

-- taxes
drop policy if exists "taxes_select_own" on public.taxes;
create policy "taxes_select_own" on public.taxes
  for select using (auth.uid() = user_id);

drop policy if exists "taxes_insert_own" on public.taxes;
create policy "taxes_insert_own" on public.taxes
  for insert with check (auth.uid() = user_id);

drop policy if exists "taxes_update_own" on public.taxes;
create policy "taxes_update_own" on public.taxes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "taxes_delete_own" on public.taxes;
create policy "taxes_delete_own" on public.taxes
  for delete using (auth.uid() = user_id);

-- expenses
drop policy if exists "expenses_select_own" on public.expenses;
create policy "expenses_select_own" on public.expenses
  for select using (auth.uid() = user_id);

drop policy if exists "expenses_insert_own" on public.expenses;
create policy "expenses_insert_own" on public.expenses
  for insert with check (auth.uid() = user_id);

drop policy if exists "expenses_update_own" on public.expenses;
create policy "expenses_update_own" on public.expenses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "expenses_delete_own" on public.expenses;
create policy "expenses_delete_own" on public.expenses
  for delete using (auth.uid() = user_id);

-- =====================================================================
-- SEED — DEFAULT CATEGORIES (global, user_id null)
-- =====================================================================
insert into public.categories (user_id, name, icon, is_default) values
  (null, 'Food & Dining',          '🍽️', true),
  (null, 'Transportation',         '🚗', true),
  (null, 'Office Supplies',        '🖇️', true),
  (null, 'Software & Subscriptions','💻', true),
  (null, 'Professional Services',  '💼', true),
  (null, 'Marketing & Advertising','📣', true),
  (null, 'Travel & Lodging',       '✈️', true),
  (null, 'Utilities',              '💡', true),
  (null, 'Education & Training',   '📚', true),
  (null, 'Health & Wellness',      '🩺', true),
  (null, 'Other',                  '📦', true)
on conflict do nothing;

-- =====================================================================
-- STORAGE — receipts bucket + per-user policies
-- File path convention: <user_id>/<filename>
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "receipts_select_own" on storage.objects;
create policy "receipts_select_own" on storage.objects
  for select using (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "receipts_insert_own" on storage.objects;
create policy "receipts_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "receipts_update_own" on storage.objects;
create policy "receipts_update_own" on storage.objects
  for update using (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "receipts_delete_own" on storage.objects;
create policy "receipts_delete_own" on storage.objects
  for delete using (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- =====================================================================
-- DONE.
-- Next steps in Supabase Dashboard:
--   1) Authentication → Providers → Email: leave "Confirm email" ENABLED.
--   2) Authentication → URL Configuration → Site URL: paste your app URL.
--      Add http://localhost:3000 and your preview URL to "Redirect URLs".
-- =====================================================================

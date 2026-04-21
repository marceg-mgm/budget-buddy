-- =====================================================================
-- BUSINESS PROFILE — adds an optional free-form `business_extra` field
-- Shown in the PDF invoice header (e.g. Website, Tax ID, etc.)
-- Run this in Supabase SQL Editor. Idempotent.
-- =====================================================================

alter table public.user_profile_settings
  add column if not exists business_extra text;

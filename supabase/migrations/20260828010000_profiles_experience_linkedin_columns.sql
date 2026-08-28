-- ============================================================================
-- profiles: reconcile years_of_experience + linkedin_url columns
-- ============================================================================
-- src/lib/resume-profile-autofill.ts (hydrateApplicationProfileFromResume)
-- and src/pages/CareerOpsPreferencesPage.tsx both read/write
-- profiles.years_of_experience and profiles.linkedin_url, but no migration
-- in this repo ever created them on public.profiles. Same pattern already
-- documented in 20260719230000_my_collection_schema_reconcile.sql: code on
-- main queries columns that were either added manually on PROD or never
-- existed on DEV. ADD COLUMN IF NOT EXISTS makes this safe to apply either
-- way.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience integer,
  ADD COLUMN IF NOT EXISTS linkedin_url text;

-- ============================================================================
-- Reverse:
--   ALTER TABLE public.profiles DROP COLUMN years_of_experience, DROP COLUMN linkedin_url;
-- ============================================================================

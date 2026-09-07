-- ============================================================================
-- profiles schema reconcile — ADDITIVE ONLY, idempotent
-- ============================================================================
-- The app has queried/written profiles.years_of_experience and
-- profiles.linkedin_url since at least ProfileSetupWizard, Profile.tsx,
-- AutoApplyPage.tsx, resume-profile-autofill.ts, and CareerOpsPreferencesPage
-- were written, but no migration in this repo ever added either column
-- (unlike sibling fields such as work_authorization and location, which do
-- have one). Same class of gap as the mc_ai_jobs / job_matches / saved_jobs
-- objects reconciled in 20260719230000_my_collection_schema_reconcile.sql:
-- created manually on PROD at some point, never captured in a migration, so
-- a fresh DEV database (or this repo's CI, which runs migrations against a
-- disposable Postgres instance) never gets them.
--
-- Guarded with IF NOT EXISTS so this applies cleanly whether the columns
-- already exist (PROD) or not (fresh DEV).
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience integer,
  ADD COLUMN IF NOT EXISTS linkedin_url text;

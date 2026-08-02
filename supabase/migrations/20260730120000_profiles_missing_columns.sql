-- ============================================================================
-- profiles: add columns the app has been reading/writing since resume-profile
-- autofill shipped, but that no migration ever created.
-- ============================================================================
-- src/lib/resume-profile-autofill.ts selects and upserts
-- years_of_experience and linkedin_url on public.profiles. Postgrest errors
-- on unknown columns in both SELECT and UPSERT payloads, so every autofill
-- call (triggered on resume upload/save) has been failing silently the same
-- way the missing `phone` column did before 20260718000000_career_fit_v1.sql.
-- Additive + idempotent, safe to re-run.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

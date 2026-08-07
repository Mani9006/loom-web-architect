-- ============================================================================
-- profiles.linkedin_url / profiles.years_of_experience — ADDITIVE, idempotent
-- ============================================================================
-- The application (Profile.tsx, ProfileSetupWizard.tsx, AutoApplyPage.tsx,
-- src/lib/resume-profile-autofill.ts, CareerOpsPreferencesPage.tsx) has read
-- and written profiles.linkedin_url and profiles.years_of_experience for a
-- while, but no prior migration in this repo creates either column, so a
-- fresh/DEV database is missing them (mirrors the situation documented in
-- 20260719230000_my_collection_schema_reconcile.sql). Guarded with
-- IF NOT EXISTS so this is a no-op anywhere the columns already exist.
-- ============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS years_of_experience numeric;

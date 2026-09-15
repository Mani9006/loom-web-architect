-- Same class of bug fixed in 20260915141500_add_profile_experience_linkedin.sql,
-- 20260718180000_add_profile_location.sql, and 20260718000000_career_fit_v1.sql
-- (profiles.phone): src/components/ProfileSetupWizard.tsx, the onboarding
-- flow every new user is sent to from OnboardingModal, writes nine more
-- profiles columns that were never created by any migration. Because
-- supabase-js does not throw on a PostgREST error and saveStep() never
-- checks `{ error }`, every step of onboarding has been showing "Saved"
-- while silently persisting nothing beyond full_name/email/phone/location/
-- target_role/job_preferences.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS desired_roles TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS seniority_level TEXT,
  ADD COLUMN IF NOT EXISTS skills TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS preferred_work_type TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS desired_locations TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS salary_expectations JSONB,
  ADD COLUMN IF NOT EXISTS work_authorization TEXT,
  ADD COLUMN IF NOT EXISTS education_level TEXT,
  ADD COLUMN IF NOT EXISTS blacklisted_companies TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS profile_completeness SMALLINT NOT NULL DEFAULT 0;

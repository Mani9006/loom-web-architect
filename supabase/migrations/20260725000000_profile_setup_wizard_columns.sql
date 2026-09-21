-- ProfileSetupWizard (routed at /profile-setup, the live onboarding flow)
-- reads and writes these columns on public.profiles, but no prior migration
-- ever created them. Every "Save" click on every step of the wizard has been
-- failing at the database level ("column ... does not exist"), silently
-- swallowed because the component doesn't check the update's error field —
-- users see a "Saved" toast, but nothing persists and "Finish" never
-- actually completes the profile.
--
-- Mirrors the additive, IF NOT EXISTS pattern used elsewhere in this repo
-- (see 20260718000000_career_fit_v1.sql, which fixed the same class of bug
-- for profiles.phone).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS desired_roles text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS seniority_level text,
  ADD COLUMN IF NOT EXISTS years_of_experience integer,
  ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS preferred_work_type text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS desired_locations text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS salary_expectations jsonb,
  ADD COLUMN IF NOT EXISTS work_authorization text,
  ADD COLUMN IF NOT EXISTS education_level text,
  ADD COLUMN IF NOT EXISTS blacklisted_companies text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS profile_completeness smallint,
  ADD COLUMN IF NOT EXISTS profile_setup_completed boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_years_of_experience_check,
  ADD CONSTRAINT profiles_years_of_experience_check
    CHECK (years_of_experience IS NULL OR years_of_experience BETWEEN 0 AND 80),
  DROP CONSTRAINT IF EXISTS profiles_profile_completeness_check,
  ADD CONSTRAINT profiles_profile_completeness_check
    CHECK (profile_completeness IS NULL OR profile_completeness BETWEEN 0 AND 100);

-- The onboarding profile setup wizard (src/components/ProfileSetupWizard.tsx,
-- routed at /profile-setup) reads and writes these columns, but the
-- canonical profiles migration never created them. Every save during
-- onboarding was silently failing against a missing-column error from
-- PostgREST, so new users' desired roles, skills, and preferences were
-- never actually persisted.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS years_of_experience NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS desired_roles TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS seniority_level TEXT,
  ADD COLUMN IF NOT EXISTS skills TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS preferred_work_type TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS desired_locations TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS salary_expectations JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS work_authorization TEXT,
  ADD COLUMN IF NOT EXISTS education_level TEXT,
  ADD COLUMN IF NOT EXISTS blacklisted_companies TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS profile_completeness INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_setup_completed BOOLEAN NOT NULL DEFAULT false;

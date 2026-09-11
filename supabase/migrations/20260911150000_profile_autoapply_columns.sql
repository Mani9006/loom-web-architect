-- The Profile Setup Wizard and Auto Apply pages have always read and written
-- a much richer profile shape than the canonical profiles migration ever
-- created (same class of bug fixed for phone/location before): the wizard's
-- saveStep() and Auto Apply's saveProfile() update these columns directly,
-- and career-ops-bootstrap, career-ops-evaluate, daily-job-fetch, and
-- match-jobs all SELECT them back out for matching. A missing column makes
-- PostgREST reject the whole query, so onboarding and the AutoApply matching
-- pipeline have been silently failing end to end.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS years_of_experience INTEGER,
  ADD COLUMN IF NOT EXISTS seniority_level TEXT,
  ADD COLUMN IF NOT EXISTS desired_roles TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS skills TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS education_level TEXT,
  -- Array, not a single value: ProfileSetupWizard and match-jobs both treat
  -- this as a multi-select ("Remote", "Hybrid", "Onsite" together).
  ADD COLUMN IF NOT EXISTS preferred_work_type TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS desired_locations TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS salary_expectations JSONB,
  ADD COLUMN IF NOT EXISTS work_authorization TEXT,
  ADD COLUMN IF NOT EXISTS languages_spoken TEXT[] NOT NULL DEFAULT ARRAY['English']::text[],
  ADD COLUMN IF NOT EXISTS blacklisted_companies TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS profile_completeness INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_setup_completed BOOLEAN NOT NULL DEFAULT false;

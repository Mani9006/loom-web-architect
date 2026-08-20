-- The Profile, Auto Apply and profile-setup wizard screens have always written
-- these fields, but they were never added to public.profiles. Every one of
-- those saves returned PostgREST 400 and was discarded; the wizard even toasted
-- "Saved" because it never inspected the error. The career-ops edge functions
-- select the same columns and silently fell back to empty preferences.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS portfolio_url TEXT,
  ADD COLUMN IF NOT EXISTS desired_roles TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS desired_locations TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_work_type TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS skills TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS blacklisted_companies TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS languages_spoken TEXT[] NOT NULL DEFAULT ARRAY['English'],
  ADD COLUMN IF NOT EXISTS seniority_level TEXT,
  ADD COLUMN IF NOT EXISTS education_level TEXT,
  ADD COLUMN IF NOT EXISTS work_authorization TEXT,
  -- NUMERIC, not INTEGER: resume inference derives fractional years and
  -- user_job_prefs.min_years_experience already carries one decimal place.
  ADD COLUMN IF NOT EXISTS years_of_experience NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS profile_completeness INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_setup_completed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_profile_completeness_range;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_profile_completeness_range
  CHECK (profile_completeness BETWEEN 0 AND 100);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_years_of_experience_range;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_years_of_experience_range
  CHECK (years_of_experience IS NULL OR years_of_experience BETWEEN 0 AND 80);

-- daily-job-fetch filters on this to find users worth scanning for.
CREATE INDEX IF NOT EXISTS profiles_desired_roles_idx
  ON public.profiles USING gin (desired_roles);

-- Backfill from job_preferences, which is where the working parts of the app
-- have been stashing this data all along.
UPDATE public.profiles SET
  linkedin_url = COALESCE(linkedin_url, NULLIF(job_preferences #>> '{applypass,profile,linkedinUrl}', '')),
  portfolio_url = COALESCE(portfolio_url, NULLIF(job_preferences #>> '{applypass,profile,portfolioUrl}', '')),
  work_authorization = COALESCE(work_authorization, NULLIF(job_preferences #>> '{applypass,profile,workAuthorization}', '')),
  years_of_experience = COALESCE(
    years_of_experience,
    NULLIF(job_preferences #>> '{applypass,profile,yearsExperience}', '')::NUMERIC(4,1)
  )
WHERE job_preferences IS NOT NULL
  AND job_preferences #> '{applypass,profile}' IS NOT NULL;

UPDATE public.profiles SET
  desired_roles = ARRAY(
    SELECT jsonb_array_elements_text(job_preferences #> '{resume_inference,target_roles}')
  )
WHERE desired_roles = '{}'
  AND jsonb_typeof(job_preferences #> '{resume_inference,target_roles}') = 'array';

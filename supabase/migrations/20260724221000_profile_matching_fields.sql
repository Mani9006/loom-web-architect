-- Restore the typed profile fields already used by onboarding, resume
-- inference, deterministic job matching, and the career-ops Edge Functions.
--
-- The UI and deployed functions previously queried these columns while the DEV
-- schema did not contain them. Type casts hid the drift at compile time and
-- caused entire profile updates / matching bootstrap requests to fail.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS blacklisted_companies text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS desired_locations text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS desired_roles text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS education_level text,
  ADD COLUMN IF NOT EXISTS languages_spoken jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS preferred_work_type text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS profile_completeness integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_setup_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS salary_expectations jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS seniority_level text,
  ADD COLUMN IF NOT EXISTS skills jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS work_authorization text,
  ADD COLUMN IF NOT EXISTS years_of_experience numeric(4,1);

UPDATE public.profiles
SET
  blacklisted_companies = COALESCE(blacklisted_companies, '{}'::text[]),
  desired_locations = COALESCE(desired_locations, '{}'::text[]),
  desired_roles = COALESCE(desired_roles, '{}'::text[]),
  languages_spoken = COALESCE(languages_spoken, '[]'::jsonb),
  preferred_work_type = COALESCE(preferred_work_type, '{}'::text[]),
  profile_completeness = COALESCE(profile_completeness, 0),
  profile_setup_completed = COALESCE(profile_setup_completed, false),
  salary_expectations = COALESCE(salary_expectations, '{}'::jsonb),
  skills = COALESCE(skills, '[]'::jsonb);

ALTER TABLE public.profiles
  ALTER COLUMN blacklisted_companies SET DEFAULT '{}'::text[],
  ALTER COLUMN blacklisted_companies SET NOT NULL,
  ALTER COLUMN desired_locations SET DEFAULT '{}'::text[],
  ALTER COLUMN desired_locations SET NOT NULL,
  ALTER COLUMN desired_roles SET DEFAULT '{}'::text[],
  ALTER COLUMN desired_roles SET NOT NULL,
  ALTER COLUMN languages_spoken SET DEFAULT '[]'::jsonb,
  ALTER COLUMN languages_spoken SET NOT NULL,
  ALTER COLUMN preferred_work_type SET DEFAULT '{}'::text[],
  ALTER COLUMN preferred_work_type SET NOT NULL,
  ALTER COLUMN profile_completeness SET DEFAULT 0,
  ALTER COLUMN profile_completeness SET NOT NULL,
  ALTER COLUMN profile_setup_completed SET DEFAULT false,
  ALTER COLUMN profile_setup_completed SET NOT NULL,
  ALTER COLUMN salary_expectations SET DEFAULT '{}'::jsonb,
  ALTER COLUMN salary_expectations SET NOT NULL,
  ALTER COLUMN skills SET DEFAULT '[]'::jsonb,
  ALTER COLUMN skills SET NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_years_of_experience_check,
  ADD CONSTRAINT profiles_years_of_experience_check
    CHECK (years_of_experience IS NULL OR years_of_experience BETWEEN 0 AND 60),
  DROP CONSTRAINT IF EXISTS profiles_completeness_check,
  ADD CONSTRAINT profiles_completeness_check
    CHECK (profile_completeness BETWEEN 0 AND 100),
  DROP CONSTRAINT IF EXISTS profiles_target_array_size_check,
  ADD CONSTRAINT profiles_target_array_size_check
    CHECK (
      cardinality(desired_roles) <= 25
      AND cardinality(desired_locations) <= 50
      AND cardinality(preferred_work_type) <= 10
      AND cardinality(blacklisted_companies) <= 250
    ),
  DROP CONSTRAINT IF EXISTS profiles_json_shapes_check,
  ADD CONSTRAINT profiles_json_shapes_check
    CHECK (
      jsonb_typeof(languages_spoken) = 'array'
      AND jsonb_typeof(salary_expectations) = 'object'
      AND jsonb_typeof(skills) IN ('array', 'object')
    );

COMMENT ON COLUMN public.profiles.years_of_experience IS
  'User-confirmed total career experience. Resume inference may suggest this value but must not silently overwrite a confirmed value.';
COMMENT ON COLUMN public.profiles.profile_completeness IS
  'Deterministic 0-100 completion percentage for application-ready profile fields; not an ATS or job-fit score.';

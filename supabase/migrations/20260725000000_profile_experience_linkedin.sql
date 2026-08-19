-- src/lib/resume-profile-autofill.ts and src/pages/CareerOpsPreferencesPage.tsx
-- read and write profiles.years_of_experience and profiles.linkedin_url, but no
-- migration in this repo ever created either column (same class of drift bug
-- fixed for phone/location in 20260718180000_add_profile_location.sql and
-- 20260718000000_career_fit_v1.sql). Every profile-hydration and confirmed-
-- experience save has been failing with "column does not exist".

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

COMMENT ON COLUMN public.profiles.years_of_experience IS
  'User-confirmed total years of experience; distinct from resume-inferred estimates.';
COMMENT ON COLUMN public.profiles.linkedin_url IS
  'Candidate LinkedIn profile URL, used to prefill application forms.';

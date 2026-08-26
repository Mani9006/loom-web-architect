-- ProfileSetupWizard, AutoApplyPage, CareerOpsPreferencesPage, and
-- resume-profile-autofill.ts have always read and written
-- years_of_experience and linkedin_url as direct columns on profiles, but no
-- migration ever created them (same class of drift as location/phone in
-- 20260718180000_add_profile_location.sql). Any query naming these columns
-- explicitly (e.g. resume-profile-autofill.ts's select list) is rejected by
-- PostgREST with "column does not exist", breaking those features entirely.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience NUMERIC,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

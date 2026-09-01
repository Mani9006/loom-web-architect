-- Same class of bug as 20260718180000_add_profile_location.sql: the profile
-- UI (resume-profile-autofill.ts, CareerOpsPreferencesPage.tsx) has always
-- read and written years_of_experience and linkedin_url, but no migration
-- ever created these columns, so PostgREST rejects any query selecting them.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience INTEGER,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

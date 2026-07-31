-- resume-profile-autofill.ts and CareerOpsPreferencesPage.tsx have always
-- read and written years_of_experience and linkedin_url on profiles, but no
-- migration ever created these columns (same class of bug fixed for
-- `location` in 20260718180000_add_profile_location.sql). A missing column
-- makes PostgREST reject the whole select/upsert, so career-ops profile
-- hydration from resumes and the confirmed-experience-years display have
-- been silently failing.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience INTEGER,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

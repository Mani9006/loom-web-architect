-- resume-profile-autofill.ts and CareerOpsPreferencesPage.tsx have always
-- read and written profiles.years_of_experience and profiles.linkedin_url,
-- but no migration ever created these columns (same class of bug as the
-- missing `location` column fixed in 20260718180000). A missing column
-- makes PostgREST reject the query/upsert.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience INTEGER,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

-- The profile UI and career-ops preferences page have always read and
-- written years_of_experience and linkedin_url on profiles (resume-profile-
-- autofill.ts, CareerOpsPreferencesPage.tsx), but no migration ever created
-- these columns. A missing column makes PostgREST reject the query, which
-- is why CareerOpsPreferencesPage.tsx's own update already had to work
-- around it with an `as never` cast instead of type-checking cleanly.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience NUMERIC,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

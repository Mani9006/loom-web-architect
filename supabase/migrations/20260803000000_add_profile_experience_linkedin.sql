-- src/lib/resume-profile-autofill.ts and src/pages/CareerOpsPreferencesPage.tsx
-- have always read and written years_of_experience/linkedin_url on profiles,
-- but (like location before it, see 20260718180000_add_profile_location.sql)
-- the canonical profiles migration never created these columns. A missing
-- column makes PostgREST reject the complete profile query.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience INTEGER,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

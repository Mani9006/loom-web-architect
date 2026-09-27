-- src/lib/resume-profile-autofill.ts and src/pages/CareerOpsPreferencesPage.tsx
-- read and write profiles.years_of_experience and profiles.linkedin_url, but
-- no prior migration ever created either column (CareerOpsPreferencesPage.tsx
-- already works around the missing type with an `as never` cast). A missing
-- column makes PostgREST reject the update, so these fields have never
-- actually persisted.
--
-- Mirrors the additive, IF NOT EXISTS pattern used elsewhere in this repo
-- (see 20260718180000_add_profile_location.sql, which fixed the same class
-- of bug for profiles.location).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience integer,
  ADD COLUMN IF NOT EXISTS linkedin_url text;

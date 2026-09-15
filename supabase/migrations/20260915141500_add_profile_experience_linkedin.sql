-- Same class of bug already fixed once for profiles.location and
-- profiles.phone (see 20260718180000_add_profile_location.sql and
-- 20260718000000_career_fit_v1.sql): the resume-autofill pipeline
-- (src/lib/resume-profile-autofill.ts) and the confirmed-experience field
-- on the Career Ops preferences page (src/pages/CareerOpsPreferencesPage.tsx)
-- have always read and written profiles.years_of_experience and
-- profiles.linkedin_url, but no migration ever created these columns. A
-- missing column makes PostgREST reject the whole query, so resume-based
-- profile autofill and the confirmed-experience-years override have never
-- actually worked against a database built from these migrations.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

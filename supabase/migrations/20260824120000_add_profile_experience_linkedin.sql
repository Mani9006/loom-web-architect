-- resume-profile-autofill.ts and CareerOpsPreferencesPage.tsx have always read
-- and written profiles.years_of_experience and profiles.linkedin_url directly
-- (not through the job_preferences JSONB blob that Profile.tsx uses), but no
-- migration ever created these columns. Same class of bug as the earlier
-- missing phone/location columns (20260718000000_career_fit_v1.sql,
-- 20260718180000_add_profile_location.sql): PostgREST rejects the whole
-- select/upsert with an unknown-column error, so resume-based profile
-- autofill and the confirmed-experience-years display in Career Ops
-- preferences have been silently no-op-ing.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

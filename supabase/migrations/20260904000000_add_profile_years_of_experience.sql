-- CareerOpsPreferencesPage reads/writes profiles.years_of_experience directly
-- (supabase.from("profiles").select("years_of_experience") /
-- .update({ years_of_experience })), and resume-profile-autofill.ts
-- reads/upserts profiles.linkedin_url — but no migration in this repo ever
-- added either column. This is the same class of bug already hit twice
-- before (profiles.phone in 20260718000000_career_fit_v1.sql, profiles.location
-- in 20260718180000_add_profile_location.sql): an upsert/select naming a
-- column PostgREST doesn't know about fails the entire query. Every save of
-- confirmed years of experience on the matching-preferences page, and every
-- post-parse autofill of the application profile (which upserts
-- linkedin_url alongside full_name/email/phone/location/target_role in one
-- call), has been failing silently.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

COMMENT ON COLUMN public.profiles.years_of_experience IS
  'User-confirmed total years of experience used by career-fit matching; distinct from the free-text value cached in job_preferences.applypass.profile.';
COMMENT ON COLUMN public.profiles.linkedin_url IS
  'LinkedIn profile URL, auto-filled from parsed resumes and editable in application-profile settings.';

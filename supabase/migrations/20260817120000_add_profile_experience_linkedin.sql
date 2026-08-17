-- The app reads/writes profiles.years_of_experience and profiles.linkedin_url
-- (resume-profile-autofill, CareerOpsPreferencesPage, ProfileSetupWizard, AutoApplyPage)
-- but no prior migration ever added these columns. Add them to match actual usage.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience integer,
  ADD COLUMN IF NOT EXISTS linkedin_url text;

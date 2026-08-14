-- The Profile page, ProfileSetupWizard, AutoApplyPage, CareerOpsPreferencesPage,
-- and the resume auto-fill helper all read and write profiles.years_of_experience
-- and profiles.linkedin_url, but no prior migration ever added either column, so
-- every one of those save/read paths fails against the real database.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience INTEGER,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

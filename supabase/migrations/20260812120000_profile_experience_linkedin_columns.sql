-- Career Ops preferences and resume-autofill code already read/write
-- profiles.years_of_experience and profiles.linkedin_url, but no prior
-- migration ever added either column, so those queries fail against a
-- production schema created from these migrations alone.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

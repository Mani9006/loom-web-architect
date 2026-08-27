-- Profile Setup, Auto-Apply, and Career Ops Preferences all read/write
-- profiles.years_of_experience and profiles.linkedin_url as real columns,
-- but no prior migration ever created them (only phone and location were
-- added this way before, see 20260718000000_career_fit_v1.sql and
-- 20260718180000_add_profile_location.sql for the same class of bug).
-- Selecting either column makes PostgREST reject the whole query, so this
-- silently broke onboarding autofill, Auto-Apply's candidate profile, and
-- the Career Ops confirmed-experience field.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

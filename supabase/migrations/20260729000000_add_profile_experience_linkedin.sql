-- The profile UI, onboarding wizard, AutoApply, and CareerOps preferences
-- have always read and written years_of_experience and linkedin_url, but
-- no migration in this repo ever created these columns (same class of gap
-- as the earlier phone/location fixes). A missing column makes PostgREST
-- reject the whole profile query, breaking onboarding and autofill.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

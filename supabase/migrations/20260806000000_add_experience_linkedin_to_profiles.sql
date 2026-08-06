-- Add years_of_experience and linkedin_url to profiles.
-- Both columns are already read/written by the frontend (resume-profile-autofill.ts,
-- CareerOpsPreferencesPage.tsx) but were never migrated, so those queries have been
-- failing against the live schema.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS years_of_experience integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS linkedin_url text DEFAULT NULL;

COMMENT ON COLUMN public.profiles.years_of_experience IS 'Confirmed years of experience, used by resume autofill and career-ops matching.';
COMMENT ON COLUMN public.profiles.linkedin_url IS 'Candidate LinkedIn profile URL, used by resume autofill.';

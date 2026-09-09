-- Resume autofill (src/lib/resume-profile-autofill.ts), the profile setup
-- wizard, and the career-ops preferences page all read and write
-- profiles.linkedin_url and profiles.years_of_experience, but no migration
-- ever created these columns. Every profiles query selecting them (and every
-- upsert writing them) is rejected by PostgREST with "column does not
-- exist", breaking resume-based autofill and the confirmed-experience
-- prompt on /career-ops/preferences.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS years_of_experience INTEGER;

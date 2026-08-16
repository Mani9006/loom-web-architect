-- profiles.years_of_experience and profiles.linkedin_url are read and
-- written throughout the app (Profile page, resume autofill, Career Ops
-- preferences confirmation) but were never captured in a migration, so
-- `supabase.from("profiles")` selects/upserts referencing them fail
-- against any database built from this migration history. Same class of
-- drift as phone/location, fixed the same way in
-- 20260718000000_career_fit_v1.sql and 20260718180000_add_profile_location.sql.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience INTEGER,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

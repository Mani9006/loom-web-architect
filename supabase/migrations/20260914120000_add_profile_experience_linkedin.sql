-- The Career Ops preferences page and the resume autofill pipeline have
-- always read and written a confirmed years-of-experience figure and a
-- LinkedIn URL on the profile, but the canonical profiles migration never
-- created either column. A missing column makes PostgREST reject the
-- complete profile query/upsert (see 20260718180000_add_profile_location.sql
-- for the same class of bug with `location`).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience NUMERIC,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

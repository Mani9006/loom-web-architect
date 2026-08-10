-- The resume-autofill flow (src/lib/resume-profile-autofill.ts) reads and
-- writes profiles.years_of_experience and profiles.linkedin_url, but no
-- migration ever created them (same class of gap fixed for `phone` in
-- 20260718000000_career_fit_v1.sql). Without this column the entire
-- `.select(...)` call fails and autofill after a resume upload silently
-- never populates the profile.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

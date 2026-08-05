-- Resume autofill (src/lib/resume-profile-autofill.ts) and the Career Ops
-- preferences page have always read and written years_of_experience and
-- linkedin_url on profiles, but no prior migration ever created either
-- column. A missing column makes PostgREST reject the whole query these
-- features depend on. Same class of drift as 20260718180000 (location).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience INTEGER,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

-- Resume autofill (src/lib/resume-profile-autofill.ts) and the Career Ops
-- preferences page already read/write profiles.linkedin_url and
-- profiles.years_of_experience, but no prior migration ever added these
-- columns (same class of bug fixed for profiles.phone in
-- 20260718000000_career_fit_v1.sql). Every autofill/save of these fields was
-- failing against PostgREST with "column does not exist".
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS years_of_experience NUMERIC(4,1);

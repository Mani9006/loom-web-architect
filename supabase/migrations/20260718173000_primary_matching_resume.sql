-- Explicit source resume used by career matching.
-- Tailored application variants must never silently replace the candidate's
-- full source history merely because they were edited more recently.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS primary_resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_primary_resume
  ON public.profiles (primary_resume_id)
  WHERE primary_resume_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.primary_resume_id IS
  'User-selected source resume for career evidence, matching, and Autopilot.';

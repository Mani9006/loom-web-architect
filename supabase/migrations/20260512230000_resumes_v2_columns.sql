-- Resume v2 schema additions.
--
-- The new builder (src/pages/ResumeBuilderV2.tsx) supports volunteer history,
-- awards/publications, and user-defined custom sections. The original
-- `resumes` table only stored the legacy section set, so v2 currently stashes
-- these extras inside `personal_info._v2_extras`. This migration adds them as
-- proper columns and backfills from the embedded extras.
--
-- Idempotent. Safe to re-run.

ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS volunteer JSONB,
  ADD COLUMN IF NOT EXISTS awards JSONB,
  ADD COLUMN IF NOT EXISTS custom_sections JSONB;

-- Backfill any data already sitting inside personal_info._v2_extras.
UPDATE public.resumes
SET
  volunteer       = COALESCE(volunteer,       personal_info -> '_v2_extras' -> 'volunteer'),
  awards          = COALESCE(awards,          personal_info -> '_v2_extras' -> 'awards'),
  custom_sections = COALESCE(custom_sections, personal_info -> '_v2_extras' -> 'customSections')
WHERE personal_info ? '_v2_extras';

-- Strip the extras blob so the column is the single source of truth.
UPDATE public.resumes
SET personal_info = personal_info - '_v2_extras'
WHERE personal_info ? '_v2_extras';

-- Useful index for the v2 builder list view (recency sort).
CREATE INDEX IF NOT EXISTS idx_resumes_user_updated
  ON public.resumes (user_id, updated_at DESC);

COMMENT ON COLUMN public.resumes.volunteer
  IS 'Array of VolunteerEntry. See src/types/resume.ts.';
COMMENT ON COLUMN public.resumes.awards
  IS 'Array of AwardEntry (awards & publications). See src/types/resume.ts.';
COMMENT ON COLUMN public.resumes.custom_sections
  IS 'Array of CustomSection for user-defined sections. See src/types/resume.ts.';

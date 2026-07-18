-- Explainable career-fit v1.
--
-- AI can explain and tailor after this gate, but it cannot override a hard
-- eligibility failure. The 0-100 score and its evidence are persisted so the
-- shortlist, application queue, audit log, and analytics all use one decision.

-- The live profile page already reads/writes phone, but the production schema
-- never added the column. This caused the whole profile query to fail.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.user_job_prefs
  ADD COLUMN IF NOT EXISTS target_countries TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS work_modes TEXT[] NOT NULL DEFAULT ARRAY['remote', 'hybrid', 'onsite']::text[],
  ADD COLUMN IF NOT EXISTS employment_types TEXT[] NOT NULL DEFAULT ARRAY['full_time']::text[],
  ADD COLUMN IF NOT EXISTS seniority_levels TEXT[] NOT NULL DEFAULT ARRAY['entry', 'mid', 'senior']::text[],
  ADD COLUMN IF NOT EXISTS excluded_companies TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS min_years_experience NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS max_years_experience NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS work_authorization TEXT,
  ADD COLUMN IF NOT EXISTS requires_sponsorship BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_salary_disclosure BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_stretch_years NUMERIC(3,1) NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS review_mode TEXT NOT NULL DEFAULT 'always',
  ADD COLUMN IF NOT EXISTS auto_apply_min_fit_score SMALLINT NOT NULL DEFAULT 82;

ALTER TABLE public.user_job_prefs
  DROP CONSTRAINT IF EXISTS user_job_prefs_review_mode_check,
  ADD CONSTRAINT user_job_prefs_review_mode_check
    CHECK (review_mode IN ('always', 'low_confidence', 'eligible_only')),
  DROP CONSTRAINT IF EXISTS user_job_prefs_auto_apply_min_fit_score_check,
  ADD CONSTRAINT user_job_prefs_auto_apply_min_fit_score_check
    CHECK (auto_apply_min_fit_score BETWEEN 0 AND 100),
  DROP CONSTRAINT IF EXISTS user_job_prefs_max_stretch_years_check,
  ADD CONSTRAINT user_job_prefs_max_stretch_years_check
    CHECK (max_stretch_years BETWEEN 0 AND 10),
  DROP CONSTRAINT IF EXISTS user_job_prefs_experience_range_check,
  ADD CONSTRAINT user_job_prefs_experience_range_check
    CHECK (
      min_years_experience IS NULL OR max_years_experience IS NULL OR
      min_years_experience <= max_years_experience
    );

-- Preserve the meaning of the old remote-only switch during migration.
UPDATE public.user_job_prefs
SET work_modes = ARRAY['remote']::text[]
WHERE remote_only = true;

ALTER TABLE public.job_evaluations
  ADD COLUMN IF NOT EXISTS fit_score SMALLINT,
  ADD COLUMN IF NOT EXISTS fit_confidence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS eligible BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dimension_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS hard_filters TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS score_version TEXT NOT NULL DEFAULT 'legacy-v1';

ALTER TABLE public.job_evaluations
  DROP CONSTRAINT IF EXISTS job_evaluations_fit_score_check,
  ADD CONSTRAINT job_evaluations_fit_score_check
    CHECK (fit_score IS NULL OR fit_score BETWEEN 0 AND 100),
  DROP CONSTRAINT IF EXISTS job_evaluations_fit_confidence_check,
  ADD CONSTRAINT job_evaluations_fit_confidence_check
    CHECK (fit_confidence IS NULL OR fit_confidence BETWEEN 0 AND 1);

CREATE INDEX IF NOT EXISTS idx_job_evaluations_user_fit
  ON public.job_evaluations (user_id, eligible DESC, fit_score DESC, evaluated_at DESC);

COMMENT ON COLUMN public.job_evaluations.fit_score IS
  'Deterministic 0-100 career-fit score; authoritative for ranking and eligibility.';
COMMENT ON COLUMN public.job_evaluations.dimension_scores IS
  'Per-dimension score, weight, evidence, and gaps used to explain the decision.';
COMMENT ON COLUMN public.job_evaluations.hard_filters IS
  'Candidate preferences or eligibility constraints that block preparation/submission.';

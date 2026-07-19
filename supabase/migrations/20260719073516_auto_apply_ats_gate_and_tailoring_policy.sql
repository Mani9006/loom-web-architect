-- Automatic application must use one explicit, evidence-backed threshold.
-- Career fit and ATS readiness remain separate metrics; the queue requires both.
ALTER TABLE public.user_job_prefs
  ADD COLUMN IF NOT EXISTS auto_apply_min_ats_score SMALLINT NOT NULL DEFAULT 85,
  ADD COLUMN IF NOT EXISTS tailoring_mode TEXT NOT NULL DEFAULT 'evidence_only';

ALTER TABLE public.user_job_prefs
  DROP CONSTRAINT IF EXISTS user_job_prefs_auto_apply_min_ats_score_check,
  ADD CONSTRAINT user_job_prefs_auto_apply_min_ats_score_check
    CHECK (auto_apply_min_ats_score BETWEEN 70 AND 95),
  DROP CONSTRAINT IF EXISTS user_job_prefs_tailoring_mode_check,
  ADD CONSTRAINT user_job_prefs_tailoring_mode_check
    CHECK (tailoring_mode IN ('evidence_only', 'coverage_boost'));

COMMENT ON COLUMN public.user_job_prefs.auto_apply_min_ats_score IS
  'Minimum deterministic ATS readiness score for automatic submission; tailored packets below this remain ready for review.';
COMMENT ON COLUMN public.user_job_prefs.tailoring_mode IS
  'evidence_only preserves strict source evidence; coverage_boost can reorder/add only source-grounded JD terms and never invent qualifications.';

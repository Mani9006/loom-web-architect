-- Resume tailoring runs: one cached "what changed" report per draft application.
-- Written only by the career-ops-tailor-report edge function (service role);
-- the owning user reads their own rows. The report pairs the master resume
-- (via the tailored resume's personal_info._v2_extras.source_resume_id lineage)
-- with the tailored resume for one job application: ATS before -> after,
-- keyword delta, and a structured change list (summary, bullets, skills).

CREATE TABLE IF NOT EXISTS public.resume_tailoring_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_application_id UUID NOT NULL REFERENCES public.draft_applications(id) ON DELETE CASCADE,
  master_resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
  tailored_resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
  -- Same 0-100 weighted scale as public.ats_scores.overall (career-ops-ats scorer).
  ats_before NUMERIC(4,1) CHECK (ats_before >= 0 AND ats_before <= 100),
  ats_after NUMERIC(4,1) CHECK (ats_after >= 0 AND ats_after <= 100),
  -- [{ type, section, entry_id, entry_label, bullet_index, before, after, jd_keywords[] }]
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT resume_tailoring_runs_draft_unique UNIQUE (draft_application_id)
);

CREATE INDEX IF NOT EXISTS idx_resume_tailoring_runs_user
  ON public.resume_tailoring_runs (user_id, created_at DESC);

ALTER TABLE public.resume_tailoring_runs ENABLE ROW LEVEL SECURITY;

-- Owner read-only. There are intentionally no INSERT/UPDATE/DELETE policies
-- for authenticated/anon: writes go through the service role (edge function),
-- which bypasses RLS.
DROP POLICY IF EXISTS "Users read own tailoring runs" ON public.resume_tailoring_runs;
CREATE POLICY "Users read own tailoring runs"
  ON public.resume_tailoring_runs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

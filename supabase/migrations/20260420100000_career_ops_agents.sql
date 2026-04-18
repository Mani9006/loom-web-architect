-- ─────────────────────────────────────────────────────────────
-- Career-Ops agents expansion — LinkedIn optimizer, real ATS scoring,
-- story bank, company research, follow-up cadence.
--
-- All tables are multi-tenant, RLS-bound to auth.uid(). Writes to
-- scoring/output tables are service-role only to keep scores honest.
-- ─────────────────────────────────────────────────────────────

-- Widen ai_usage_daily kind to include new task classes.
ALTER TABLE public.ai_usage_daily DROP CONSTRAINT IF EXISTS ai_usage_daily_kind_check;
ALTER TABLE public.ai_usage_daily ADD CONSTRAINT ai_usage_daily_kind_check
  CHECK (kind IN (
    'evaluation', 'tailor', 'draft_answers',
    'linkedin', 'ats', 'story', 'research', 'followup'
  ));

-- ── linkedin_optimizations ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.linkedin_optimizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('headline', 'about', 'post', 'connection_note')),
  target_role TEXT,
  source_text TEXT,
  output_text TEXT NOT NULL,
  rationale TEXT,
  model TEXT NOT NULL,
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_linkedin_opt_user_kind
  ON public.linkedin_optimizations (user_id, kind, created_at DESC);

ALTER TABLE public.linkedin_optimizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own linkedin opts" ON public.linkedin_optimizations;
CREATE POLICY "Users read own linkedin opts"
  ON public.linkedin_optimizations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own linkedin opts" ON public.linkedin_optimizations;
CREATE POLICY "Users delete own linkedin opts"
  ON public.linkedin_optimizations FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- INSERT only via service role (edge function writes the AI output).

-- ── ats_scores ───────────────────────────────────────────────
-- Real structured ATS scoring per resume + optional JD pairing.
CREATE TABLE IF NOT EXISTS public.ats_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES public.resumes(id) ON DELETE CASCADE,
  scanned_job_id UUID REFERENCES public.scanned_jobs(id) ON DELETE SET NULL,
  overall NUMERIC(4,1) NOT NULL CHECK (overall >= 0 AND overall <= 100),
  -- Six dimensions, each 0-100
  dim_format NUMERIC(4,1) NOT NULL DEFAULT 0,
  dim_keywords NUMERIC(4,1) NOT NULL DEFAULT 0,
  dim_experience NUMERIC(4,1) NOT NULL DEFAULT 0,
  dim_skills NUMERIC(4,1) NOT NULL DEFAULT 0,
  dim_education NUMERIC(4,1) NOT NULL DEFAULT 0,
  dim_impact NUMERIC(4,1) NOT NULL DEFAULT 0,
  matched_keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
  missing_keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  model TEXT NOT NULL,
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ats_scores_user_resume
  ON public.ats_scores (user_id, resume_id, created_at DESC);

ALTER TABLE public.ats_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own ats scores" ON public.ats_scores;
CREATE POLICY "Users read own ats scores"
  ON public.ats_scores FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own ats scores" ON public.ats_scores;
CREATE POLICY "Users delete own ats scores"
  ON public.ats_scores FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ── interview_stories ─────────────────────────────────────────
-- STAR+Reflection stories accumulated from evaluations for interview prep.
CREATE TABLE IF NOT EXISTS public.interview_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_evaluation_id UUID REFERENCES public.job_evaluations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  theme TEXT, -- e.g. "leadership", "conflict", "failure", "impact"
  situation TEXT NOT NULL,
  task TEXT NOT NULL,
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  reflection TEXT,
  archetypes TEXT[] NOT NULL DEFAULT '{}'::text[], -- which role types this fits
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_stories_user
  ON public.interview_stories (user_id, created_at DESC);

ALTER TABLE public.interview_stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own stories" ON public.interview_stories;
CREATE POLICY "Users manage own stories"
  ON public.interview_stories FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_interview_stories_updated_at ON public.interview_stories;
CREATE TRIGGER update_interview_stories_updated_at
  BEFORE UPDATE ON public.interview_stories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── company_research ──────────────────────────────────────────
-- Deep company research cached per-user for interview prep.
CREATE TABLE IF NOT EXISTS public.company_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_slug TEXT NOT NULL,
  company_name TEXT NOT NULL,
  role_title TEXT,
  report_md TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_slug, role_title)
);

CREATE INDEX IF NOT EXISTS idx_company_research_user
  ON public.company_research (user_id, created_at DESC);

ALTER TABLE public.company_research ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own research" ON public.company_research;
CREATE POLICY "Users read own research"
  ON public.company_research FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own research" ON public.company_research;
CREATE POLICY "Users delete own research"
  ON public.company_research FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ── application_followups ────────────────────────────────────
-- Follow-up cadence drafts (day 7 / 14 / 21) for each application.
CREATE TABLE IF NOT EXISTS public.application_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_application_id UUID REFERENCES public.draft_applications(id) ON DELETE CASCADE,
  day INT NOT NULL CHECK (day IN (7, 14, 21, 28)),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (draft_application_id, day)
);

ALTER TABLE public.application_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own followups" ON public.application_followups;
CREATE POLICY "Users manage own followups"
  ON public.application_followups FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

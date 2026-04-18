-- ─────────────────────────────────────────────────────────────────
-- Career-Ops pipeline — scan → evaluate → draft application
--
-- Ported design from github.com/santifer/career-ops but adapted for
-- a multi-tenant web app: per-user evaluations, RLS on every table,
-- per-user daily AI cost caps, worker-safe scan claims.
--
-- Tables:
--   scan_companies      — admin-managed list of tracked companies
--   scanned_jobs        — deduped job postings from Greenhouse/Ashby/Lever
--   user_job_prefs      — per-user search + auto-apply preferences
--   job_evaluations     — per-user A-F score + tailored context per job
--   ai_usage_daily      — rolling daily AI token + count per user per kind
--   draft_applications  — tailored CV + draft answers ready for review
-- ─────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── scan_companies ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scan_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  api_type TEXT NOT NULL CHECK (api_type IN ('greenhouse', 'ashby', 'lever')),
  api_identifier TEXT NOT NULL, -- board token, e.g. "anthropic"
  careers_url TEXT,
  category TEXT, -- "AI Labs", "Voice AI", etc.
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_scanned_at TIMESTAMPTZ,
  last_scan_count INT,
  last_scan_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_companies_enabled
  ON public.scan_companies (enabled, last_scanned_at NULLS FIRST);

ALTER TABLE public.scan_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read scan companies" ON public.scan_companies;
CREATE POLICY "Authenticated users read scan companies"
  ON public.scan_companies FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage scan companies" ON public.scan_companies;
CREATE POLICY "Admins manage scan companies"
  ON public.scan_companies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_scan_companies_updated_at ON public.scan_companies;
CREATE TRIGGER update_scan_companies_updated_at
  BEFORE UPDATE ON public.scan_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── scanned_jobs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scanned_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.scan_companies(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  department TEXT,
  employment_type TEXT,
  remote_policy TEXT,
  compensation_text TEXT,
  description_md TEXT,
  apply_url TEXT NOT NULL,
  posted_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_live BOOLEAN NOT NULL DEFAULT true,
  raw JSONB, -- keep the upstream payload for re-parsing later
  UNIQUE (company_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_scanned_jobs_live_seen
  ON public.scanned_jobs (is_live, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_scanned_jobs_company
  ON public.scanned_jobs (company_id, is_live);
CREATE INDEX IF NOT EXISTS idx_scanned_jobs_title_trgm
  ON public.scanned_jobs USING gin (title gin_trgm_ops);

ALTER TABLE public.scanned_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read scanned jobs" ON public.scanned_jobs;
CREATE POLICY "Authenticated users read scanned jobs"
  ON public.scanned_jobs FOR SELECT TO authenticated USING (is_live = true);

-- Writes happen via service-role edge function only. No user INSERT/UPDATE policy on purpose.

-- ── user_job_prefs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_job_prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  target_roles TEXT[] NOT NULL DEFAULT '{}'::text[],
  negative_keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
  locations TEXT[] NOT NULL DEFAULT '{}'::text[],
  remote_only BOOLEAN NOT NULL DEFAULT false,
  comp_target_usd_min INT,
  comp_target_usd_max INT,
  auto_apply_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_apply_min_score NUMERIC(3,2) NOT NULL DEFAULT 4.50
    CHECK (auto_apply_min_score >= 0 AND auto_apply_min_score <= 5),
  daily_apply_cap INT NOT NULL DEFAULT 5 CHECK (daily_apply_cap >= 0 AND daily_apply_cap <= 50),
  auto_apply_portals TEXT[] NOT NULL DEFAULT ARRAY['greenhouse', 'ashby', 'lever']::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_job_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own job prefs" ON public.user_job_prefs;
CREATE POLICY "Users manage own job prefs"
  ON public.user_job_prefs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_job_prefs_updated_at ON public.user_job_prefs;
CREATE TRIGGER update_user_job_prefs_updated_at
  BEFORE UPDATE ON public.user_job_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── job_evaluations ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scanned_job_id UUID NOT NULL REFERENCES public.scanned_jobs(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
  score NUMERIC(3,2) NOT NULL CHECK (score >= 0 AND score <= 5),
  archetype TEXT,
  tier TEXT CHECK (tier IN ('A', 'B', 'C', 'D', 'F')),
  summary TEXT,
  keyword_matches TEXT[] DEFAULT '{}'::text[],
  gaps TEXT[] DEFAULT '{}'::text[],
  star_stories JSONB DEFAULT '[]'::jsonb,
  report_md TEXT,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  error_message TEXT,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, scanned_job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_evaluations_user_score
  ON public.job_evaluations (user_id, score DESC, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_evaluations_job
  ON public.job_evaluations (scanned_job_id);

ALTER TABLE public.job_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own evaluations" ON public.job_evaluations;
CREATE POLICY "Users read own evaluations"
  ON public.job_evaluations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own evaluations" ON public.job_evaluations;
CREATE POLICY "Users delete own evaluations"
  ON public.job_evaluations FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- INSERT/UPDATE only via service-role edge function (keeps scoring honest).

DROP POLICY IF EXISTS "Admins read all evaluations" ON public.job_evaluations;
CREATE POLICY "Admins read all evaluations"
  ON public.job_evaluations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ── ai_usage_daily ───────────────────────────────────────────────
-- Rolling per-user per-day cost + count tracker. Enforces cap before
-- an expensive AI call; logs tokens after.
CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('evaluation', 'tailor', 'draft_answers')),
  count INT NOT NULL DEFAULT 0,
  tokens_in BIGINT NOT NULL DEFAULT 0,
  tokens_out BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, kind)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_day ON public.ai_usage_daily (day);

ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own ai usage" ON public.ai_usage_daily;
CREATE POLICY "Users read own ai usage"
  ON public.ai_usage_daily FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read all ai usage" ON public.ai_usage_daily;
CREATE POLICY "Admins read all ai usage"
  ON public.ai_usage_daily FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Service-role function increments atomically.
CREATE OR REPLACE FUNCTION public.increment_ai_usage(
  p_user_id UUID,
  p_kind TEXT,
  p_tokens_in INT,
  p_tokens_out INT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ai_usage_daily (user_id, day, kind, count, tokens_in, tokens_out)
  VALUES (p_user_id, CURRENT_DATE, p_kind, 1, p_tokens_in, p_tokens_out)
  ON CONFLICT (user_id, day, kind) DO UPDATE
  SET count = public.ai_usage_daily.count + 1,
      tokens_in = public.ai_usage_daily.tokens_in + EXCLUDED.tokens_in,
      tokens_out = public.ai_usage_daily.tokens_out + EXCLUDED.tokens_out;
END;
$$;

-- ── draft_applications ───────────────────────────────────────────
-- When a user (or auto-apply) picks an evaluation, we prepare a
-- tailored CV + draft answers. The existing applypass_tasks queue
-- handles the actual submission; this table holds the drafts.
CREATE TABLE IF NOT EXISTS public.draft_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evaluation_id UUID NOT NULL REFERENCES public.job_evaluations(id) ON DELETE CASCADE,
  tailored_resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
  tailored_cv_md TEXT,
  tailored_cv_pdf_url TEXT,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{question, answer}]
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'queued', 'submitted', 'skipped', 'failed')),
  applypass_task_id UUID REFERENCES public.applypass_tasks(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, evaluation_id)
);

CREATE INDEX IF NOT EXISTS idx_draft_applications_user_status
  ON public.draft_applications (user_id, status, created_at DESC);

ALTER TABLE public.draft_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own drafts" ON public.draft_applications;
CREATE POLICY "Users manage own drafts"
  ON public.draft_applications FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read all drafts" ON public.draft_applications;
CREATE POLICY "Admins read all drafts"
  ON public.draft_applications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_draft_applications_updated_at ON public.draft_applications;
CREATE TRIGGER update_draft_applications_updated_at
  BEFORE UPDATE ON public.draft_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Seed: 20 top AI companies (portals.yml excerpt) ─────────────
INSERT INTO public.scan_companies (slug, name, api_type, api_identifier, careers_url, category) VALUES
  ('anthropic',    'Anthropic',     'greenhouse', 'anthropic',    'https://www.anthropic.com/careers',    'AI Labs'),
  ('openai',       'OpenAI',        'greenhouse', 'openai',       'https://openai.com/careers',           'AI Labs'),
  ('mistral',      'Mistral',       'ashby',      'mistral',      'https://jobs.ashbyhq.com/mistral',     'AI Labs'),
  ('cohere',       'Cohere',        'lever',      'cohere',       'https://jobs.lever.co/cohere',         'AI Labs'),
  ('elevenlabs',   'ElevenLabs',    'ashby',      'elevenlabs',   'https://jobs.ashbyhq.com/elevenlabs',  'Voice AI'),
  ('deepgram',     'Deepgram',      'ashby',      'deepgram',     'https://jobs.ashbyhq.com/deepgram',    'Voice AI'),
  ('hume',         'Hume AI',       'ashby',      'hume',         'https://jobs.ashbyhq.com/hume',        'Voice AI'),
  ('vapi',         'Vapi',          'ashby',      'vapi',         'https://jobs.ashbyhq.com/vapi',        'Voice AI'),
  ('retool',       'Retool',        'greenhouse', 'retool',       'https://retool.com/careers',           'AI Platforms'),
  ('vercel',       'Vercel',        'greenhouse', 'vercel',       'https://vercel.com/careers',           'AI Platforms'),
  ('temporal',     'Temporal',      'greenhouse', 'temporaltechnologies', 'https://temporal.io/careers', 'AI Platforms'),
  ('arize',        'Arize AI',      'greenhouse', 'arizeai',      'https://arize.com/careers',            'AI Platforms'),
  ('langchain',    'LangChain',     'greenhouse', 'langchain',    'https://www.langchain.com/careers',    'AI Labs'),
  ('pinecone',     'Pinecone',      'greenhouse', 'pinecone',     'https://www.pinecone.io/careers',      'AI Platforms'),
  ('langfuse',     'Langfuse',      'ashby',      'langfuse',     'https://jobs.ashbyhq.com/langfuse',    'LLMOps'),
  ('wandb',        'Weights & Biases', 'greenhouse', 'weightsandbiases', 'https://wandb.ai/careers',      'LLMOps'),
  ('sierra',       'Sierra',        'ashby',      'sierra',       'https://jobs.ashbyhq.com/sierra',      'Contact Center'),
  ('decagon',      'Decagon',       'ashby',      'decagon',      'https://jobs.ashbyhq.com/decagon',     'Contact Center'),
  ('n8n',          'n8n',           'ashby',      'n8n',          'https://jobs.ashbyhq.com/n8n',         'Automation'),
  ('zapier',       'Zapier',        'greenhouse', 'zapier',       'https://zapier.com/jobs',              'Automation')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  api_type = EXCLUDED.api_type,
  api_identifier = EXCLUDED.api_identifier,
  careers_url = EXCLUDED.careers_url,
  category = EXCLUDED.category,
  updated_at = now();

-- ── pg_cron: hourly scan ─────────────────────────────────────────
-- Scheduled via pg_cron. The cron job invokes the edge function via
-- supabase.net; the function does the actual HTTP work.
-- The job is created in the extensions schema. If pg_cron is not
-- provisioned (local dev), this statement is a no-op thanks to the
-- DO block.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('career-ops-hourly-scan')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'career-ops-hourly-scan');
    PERFORM cron.schedule(
      'career-ops-hourly-scan',
      '7 * * * *',  -- seven minutes past the hour, every hour
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.career_ops_scan_url', true),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object('source', 'pg_cron')
      );
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron or pg_net not configured — skip silently
  NULL;
END $$;

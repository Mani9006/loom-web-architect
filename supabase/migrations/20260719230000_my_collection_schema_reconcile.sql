-- ============================================================================
-- My Collection schema reconcile — ADDITIVE ONLY, idempotent
-- ============================================================================
-- The code on main queries several tables/columns that no migration in this
-- repo creates (they were created manually on PROD, or never existed on DEV).
-- This migration creates exactly the verified-missing objects, mirroring the
-- column shapes in src/integrations/supabase/types.ts.
--
-- Everything is guarded with IF NOT EXISTS / DROP ... IF EXISTS so the file
-- applies cleanly on PROD (where public.mc_ai_jobs already exists, created
-- manually) as well as on a fresh DEV database.
--
-- Objects:
--   1. public.mc_ai_jobs            table  (+ realtime publication)
--   2. public.mc_tracked_jobs.deleted_at   column (soft-delete / Trash)
--   3. public.subscription_plans    table
--   4. public.cached_jobs           table
--   5. public.job_matches           table
--   6. public.saved_jobs            table
--   7. public.user_seen_jobs        table
-- Evidence of code usage for each object is in the PR body.
-- ============================================================================

-- ── 1. mc_ai_jobs ───────────────────────────────────────────────────────────
-- Local-worker AI job queue. The frontend enqueues rows and waits for the
-- user's local worker to write results back (src/lib/mc-ai-jobs.ts).
CREATE TABLE IF NOT EXISTS public.mc_ai_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  uuid REFERENCES public.mc_sessions(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  status      text NOT NULL DEFAULT 'queued',
  model       text NOT NULL DEFAULT 'haiku-4-5',
  prompt      text NOT NULL,
  input       jsonb,
  result      text,
  result_json jsonb,
  error       text,
  attempts    integer NOT NULL DEFAULT 0,
  priority    integer NOT NULL DEFAULT 5,
  created_at  timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS mc_ai_jobs_user_created_idx
  ON public.mc_ai_jobs (user_id, created_at DESC);

-- Worker pickup path: oldest queued jobs first, highest priority first.
CREATE INDEX IF NOT EXISTS mc_ai_jobs_status_queue_idx
  ON public.mc_ai_jobs (status, priority DESC, created_at);

ALTER TABLE public.mc_ai_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mc_ai_jobs_owner_all" ON public.mc_ai_jobs;
CREATE POLICY "mc_ai_jobs_owner_all" ON public.mc_ai_jobs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mc_ai_jobs TO authenticated;

-- The frontend subscribes to UPDATE postgres_changes on this table
-- (src/lib/mc-ai-jobs.ts waitForJob), so it must be in the realtime
-- publication. Guarded: no-op when already published or publication absent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'mc_ai_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mc_ai_jobs;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL; -- publication missing (non-Supabase env)
END $$;

-- ── 2. mc_tracked_jobs.deleted_at ───────────────────────────────────────────
-- Soft-delete column backing the board Trash dialog. Queried/updated in
-- BoardTab, DiscoverTab, StatsTab, TrashDialog, MyCollectionPage.
ALTER TABLE public.mc_tracked_jobs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Hot path: board loads non-deleted cards for a session.
CREATE INDEX IF NOT EXISTS mc_tracked_jobs_not_deleted_idx
  ON public.mc_tracked_jobs (session_id) WHERE deleted_at IS NULL;

-- ── 3. subscription_plans ───────────────────────────────────────────────────
-- Written only by service-role edge functions (stripe-webhook, create-checkout).
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type              text NOT NULL DEFAULT 'free',
  status                 text NOT NULL DEFAULT 'active',
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_plans_user_idx
  ON public.subscription_plans (user_id);

CREATE INDEX IF NOT EXISTS subscription_plans_stripe_subscription_idx
  ON public.subscription_plans (stripe_subscription_id);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_plans_owner_select" ON public.subscription_plans;
CREATE POLICY "subscription_plans_owner_select" ON public.subscription_plans
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.subscription_plans FROM anon, authenticated;
GRANT SELECT ON public.subscription_plans TO authenticated;

-- ── 4. cached_jobs ──────────────────────────────────────────────────────────
-- Shared job-search result cache written by service-role search functions
-- (perplexity-job-search upserts onConflict job_fingerprint). No user_id:
-- not owner-scoped, so RLS stays enabled with no client-facing policies.
CREATE TABLE IF NOT EXISTS public.cached_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  company          text NOT NULL,
  location         text NOT NULL,
  description      text,
  apply_url        text,
  salary           text,
  job_type         text,
  remote           boolean,
  source           text,
  date_posted      text,
  role_category    text,
  experience_level text,
  industry         text,
  job_fingerprint  text NOT NULL UNIQUE,
  expires_at       timestamptz,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cached_jobs_expires_at_idx
  ON public.cached_jobs (expires_at);

ALTER TABLE public.cached_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cached_jobs FROM anon, authenticated;

-- ── 5. job_matches ──────────────────────────────────────────────────────────
-- match-jobs edge function upserts onConflict (user_id, job_id); the
-- AutoApply page reads rows (with a jobs(*) embed that needs the FK).
CREATE TABLE IF NOT EXISTS public.job_matches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id        uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  match_score   numeric NOT NULL DEFAULT 0,
  match_reasons jsonb,
  dismissed     boolean DEFAULT false,
  liked         boolean DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS job_matches_user_score_idx
  ON public.job_matches (user_id, dismissed, match_score DESC);

ALTER TABLE public.job_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_matches_owner_all" ON public.job_matches;
CREATE POLICY "job_matches_owner_all" ON public.job_matches
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_matches TO authenticated;

-- ── 6. saved_jobs ───────────────────────────────────────────────────────────
-- Written/read directly by the signed-in user (JobSearchPage, JobTracker).
CREATE TABLE IF NOT EXISTS public.saved_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_title   text NOT NULL,
  company     text NOT NULL,
  location    text,
  description text,
  apply_url   text,
  salary      text,
  job_type    text,
  remote      boolean,
  date_posted text,
  source      text,
  saved_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_jobs_user_idx
  ON public.saved_jobs (user_id, saved_at DESC);

ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_jobs_owner_all" ON public.saved_jobs;
CREATE POLICY "saved_jobs_owner_all" ON public.saved_jobs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_jobs TO authenticated;

-- ── 7. user_seen_jobs ───────────────────────────────────────────────────────
-- Dedupe memory for job search, written by service-role search functions
-- (perplexity-job-search upserts onConflict (user_id, job_fingerprint)).
CREATE TABLE IF NOT EXISTS public.user_seen_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_fingerprint text NOT NULL,
  seen_at         timestamptz DEFAULT now(),
  UNIQUE (user_id, job_fingerprint)
);

ALTER TABLE public.user_seen_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_seen_jobs_owner_select" ON public.user_seen_jobs;
CREATE POLICY "user_seen_jobs_owner_select" ON public.user_seen_jobs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.user_seen_jobs FROM anon, authenticated;
GRANT SELECT ON public.user_seen_jobs TO authenticated;

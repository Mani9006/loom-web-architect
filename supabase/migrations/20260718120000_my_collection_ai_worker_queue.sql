-- ============================================================================
-- My Collection — AI job queue + worker heartbeats
-- ============================================================================
-- `mc_ai_jobs` and `mc_worker_heartbeats` already exist in the live database
-- (see src/integrations/supabase/types.ts) and are relied on by
-- src/lib/mc-ai-jobs.ts, DiscoverTab, BoardTab, and WorkerStatusBadge — but
-- no migration ever created them, so a fresh environment (new Supabase
-- project, staging, disaster recovery) could not reproduce this schema and
-- every AI feature in My Collection (Discover, Tailor with AI, worker
-- status) would fail with "relation does not exist".
--
-- This migration is ADDITIVE ONLY and safe to run against a database that
-- already has these tables (IF NOT EXISTS / guarded publication add).
-- ============================================================================

-- ── AI job queue ────────────────────────────────────────────────────────
-- The frontend never calls an LLM directly. It inserts a row here; the
-- user's local worker (running on their own machine) polls for queued rows,
-- runs the model, and writes the result back. The frontend then either
-- subscribes to postgres_changes on this row (realtime) or polls it.

CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    uuid REFERENCES mc_sessions(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  status        text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed', 'canceled')),
  model         text NOT NULL DEFAULT 'haiku-4-5',
  prompt        text NOT NULL,
  input         jsonb,
  result        text,
  result_json   jsonb,
  error         text,
  attempts      integer NOT NULL DEFAULT 0,
  priority      integer NOT NULL DEFAULT 5,
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

CREATE INDEX IF NOT EXISTS mc_ai_jobs_user_status_idx
  ON mc_ai_jobs (user_id, status, created_at);
CREATE INDEX IF NOT EXISTS mc_ai_jobs_session_idx
  ON mc_ai_jobs (session_id);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mc_ai_jobs_owner_all" ON mc_ai_jobs;
CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- waitForJob() in src/lib/mc-ai-jobs.ts subscribes to postgres_changes on
-- this table, so it must be in the realtime publication. Guarded so this
-- is safe to re-run against a database where it's already been added.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'mc_ai_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mc_ai_jobs;
  END IF;
END $$;

-- ── Worker heartbeats ───────────────────────────────────────────────────
-- The user's local worker upserts its own row every ~30s so
-- WorkerStatusBadge can show whether AI features are currently reachable
-- (isWorkerOnline() in src/lib/mc-ai-jobs.ts treats >90s stale as offline).

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen     timestamptz NOT NULL DEFAULT now(),
  hostname      text,
  version       text
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mc_worker_heartbeats_owner_all" ON mc_worker_heartbeats;
CREATE POLICY "mc_worker_heartbeats_owner_all" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Reverse:
--   ALTER PUBLICATION supabase_realtime DROP TABLE mc_ai_jobs;
--   DROP TABLE mc_ai_jobs, mc_worker_heartbeats CASCADE;
-- ============================================================================

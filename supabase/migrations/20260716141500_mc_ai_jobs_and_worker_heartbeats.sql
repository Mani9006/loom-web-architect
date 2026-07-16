-- ============================================================================
-- My Collection — missing migrations for mc_ai_jobs / mc_worker_heartbeats
-- ============================================================================
-- Both tables already exist in production (see src/integrations/supabase/
-- types.ts, which is generated from the live schema) and are actively used
-- by src/lib/mc-ai-jobs.ts and WorkerStatusBadge, but neither ever shipped
-- as a migration. Any fresh environment built from `supabase db reset` /
-- migrations alone (local dev, CI, disaster recovery) is missing both
-- tables entirely. This migration brings history in sync with reality.
--
-- Architecture: the site never calls the AI provider directly. It enqueues
-- a row in mc_ai_jobs; a worker running under the user's own account (their
-- machine, authenticated as that user) polls/subscribes, does the work, and
-- writes the result back. It also upserts a heartbeat row so the UI can
-- show whether AI features are currently available.
-- ============================================================================

-- ── AI job queue ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    uuid REFERENCES mc_sessions(id) ON DELETE CASCADE,
  kind          text NOT NULL
    CHECK (kind IN ('tailor','score_job','classify_email','company_research','rewrite_line','test','other')),
  status        text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','done','failed','canceled')),
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
  ON mc_ai_jobs (user_id, status, priority, created_at);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Guarded: don't error if this table is already published (e.g. it was
-- added manually before this migration existed).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mc_ai_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mc_ai_jobs;
  END IF;
END $$;

-- ── Worker heartbeats ───────────────────────────────────────────────────
-- One row per user, upserted every ~30s by their local worker while it's
-- running. isWorkerOnline() treats a heartbeat older than 90s as offline.

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname      text,
  version       text,
  last_seen     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_worker_heartbeats_owner_all" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Reverse:
--   ALTER PUBLICATION supabase_realtime DROP TABLE mc_ai_jobs;
--   DROP TABLE mc_worker_heartbeats, mc_ai_jobs CASCADE;
-- ============================================================================

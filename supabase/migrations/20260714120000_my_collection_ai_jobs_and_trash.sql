-- ============================================================================
-- My Collection — AI job queue, worker heartbeats, and soft-delete (backfill)
-- ============================================================================
-- The frontend (src/lib/mc-ai-jobs.ts, BoardTab, TrashDialog, StatsTab) has
-- always depended on mc_ai_jobs, mc_worker_heartbeats, and a deleted_at
-- column on mc_tracked_jobs, but no migration in this repo ever created them.
-- Without this, a fresh database provisioned from supabase/migrations has a
-- Board tab that fails to load (queries mc_tracked_jobs.deleted_at, which
-- doesn't exist) and Discover/Tailor AI actions that fail outright (insert
-- into a nonexistent mc_ai_jobs table). This migration is ADDITIVE ONLY and
-- safe to re-run.
-- ============================================================================

-- ── 1. Soft-delete support on tracked jobs (Board trash / undo) ───────────

ALTER TABLE mc_tracked_jobs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS mc_tracked_deleted_idx
  ON mc_tracked_jobs (session_id, deleted_at);

-- ── 2. AI job queue ────────────────────────────────────────────────────────
-- The frontend inserts a row here; the user's local worker (running `claude`
-- with their own plan) picks up queued rows, runs the prompt, and writes the
-- result back. The frontend waits on this row via Supabase realtime (with a
-- polling fallback).

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
  ON mc_ai_jobs (user_id, status, priority DESC, created_at);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mc_ai_jobs_owner_all" ON mc_ai_jobs;
CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- The frontend subscribes to UPDATE events on this table (waitForJob in
-- src/lib/mc-ai-jobs.ts) — it needs to be in the realtime publication.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE mc_ai_jobs;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- ── 3. Worker heartbeats ───────────────────────────────────────────────────
-- One row per user; the local worker upserts this every ~30s so the UI can
-- show whether AI features are currently available (WorkerStatusBadge).

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname    text,
  version     text,
  last_seen   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mc_worker_heartbeats_owner_all" ON mc_worker_heartbeats;
CREATE POLICY "mc_worker_heartbeats_owner_all" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Reverse with:
--   DROP TABLE mc_worker_heartbeats, mc_ai_jobs CASCADE;
--   ALTER TABLE mc_tracked_jobs DROP COLUMN deleted_at;
-- ============================================================================

-- ── My Collection: missing tables & columns ──────────────────────────────────
-- This migration adds the three missing pieces that the frontend code requires
-- but that were omitted from the initial 20260427120000_my_collection.sql:
--
--   1. deleted_at column on mc_tracked_jobs  (soft-delete / trash system)
--   2. mc_ai_jobs table                      (local-worker job queue)
--   3. mc_worker_heartbeats table            (worker online indicator)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Soft-delete support on mc_tracked_jobs ─────────────────────────────────
ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Index so trash queries (WHERE deleted_at IS NOT NULL) stay fast.
CREATE INDEX IF NOT EXISTS mc_tracked_jobs_deleted_session_idx
  ON mc_tracked_jobs (session_id, deleted_at);

-- ── 2. AI job queue (local-worker task table) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    uuid REFERENCES mc_sessions(id) ON DELETE SET NULL,
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
  attempts      int NOT NULL DEFAULT 0,
  priority      int NOT NULL DEFAULT 5,
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

CREATE INDEX IF NOT EXISTS mc_ai_jobs_queue_idx
  ON mc_ai_jobs (status, priority DESC, created_at ASC)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS mc_ai_jobs_user_idx
  ON mc_ai_jobs (user_id, created_at DESC);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;

-- Users can insert their own jobs and read/update all their own jobs.
CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 3. Worker heartbeat table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen     timestamptz NOT NULL DEFAULT now(),
  hostname      text,
  worker_version text
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_worker_heartbeats_owner_all" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

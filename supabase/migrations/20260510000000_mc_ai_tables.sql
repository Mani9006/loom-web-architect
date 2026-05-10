-- ============================================================================
-- My Collection — missing tables and columns
-- ============================================================================
-- Additive migration that fills the gaps left by 20260427120000_my_collection:
--   1. deleted_at column on mc_tracked_jobs  (soft-delete / Trash feature)
--   2. mc_ai_jobs table                      (local-worker job queue)
--   3. mc_worker_heartbeats table            (worker online/offline badge)
-- ============================================================================

-- ── 1. Soft-delete support ────────────────────────────────────────────────────
-- BoardTab filters by deleted_at IS NULL; TrashDialog shows deleted_at IS NOT NULL.

ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial index for the Trash query (only covers soft-deleted rows).
CREATE INDEX IF NOT EXISTS mc_tracked_deleted_idx
  ON mc_tracked_jobs (session_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- ── 2. AI job queue (picked up by the user's local Mac-mini worker) ───────────
-- The frontend inserts a row here; the worker polls for queued rows, calls
-- `claude -p` locally, and writes result/result_json back. Realtime is used
-- for live status updates in the browser.

CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  uuid        REFERENCES mc_sessions(id) ON DELETE SET NULL,
  kind        text        NOT NULL,
  status      text        NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed', 'canceled')),
  model       text        NOT NULL DEFAULT 'haiku-4-5',
  prompt      text        NOT NULL,
  input       jsonb,
  result      text,
  result_json jsonb,
  error       text,
  attempts    integer     NOT NULL DEFAULT 0,
  priority    integer     NOT NULL DEFAULT 5,
  created_at  timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  finished_at timestamptz
);

-- Covering index for the worker's poll query.
CREATE INDEX IF NOT EXISTS mc_ai_jobs_queue_idx
  ON mc_ai_jobs (status, priority DESC, created_at)
  WHERE status IN ('queued', 'running');

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 3. Worker heartbeat ───────────────────────────────────────────────────────
-- The Mac-mini worker UPSERTs its hostname + timestamp every 30 s.
-- WorkerStatusBadge reads this to show online/offline state.

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  user_id   uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname  text,
  last_seen timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_worker_heartbeats_owner_all" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Reverse with:
--   ALTER TABLE mc_tracked_jobs DROP COLUMN IF EXISTS deleted_at;
--   DROP TABLE IF EXISTS mc_ai_jobs, mc_worker_heartbeats;
-- ============================================================================

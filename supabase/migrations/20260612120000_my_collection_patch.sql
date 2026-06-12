-- ============================================================================
-- My Collection — patch: mc_ai_jobs, mc_worker_heartbeats, deleted_at column
-- ============================================================================
-- Adds three missing pieces that were referenced in frontend code but never
-- had a migration:
--   1. mc_worker_heartbeats — written by the user's local Claude worker
--   2. mc_ai_jobs           — queue consumed by the same worker
--   3. deleted_at on mc_tracked_jobs — soft-delete / trash column
-- ============================================================================

-- ── 1. mc_worker_heartbeats ──────────────────────────────────────────────────
-- The user's Mac mini worker writes here every 30 seconds. The frontend reads
-- this to show the "AI ready / AI offline" status badge (WorkerStatusBadge).

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname   text,
  last_seen  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_heartbeat_owner_all" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 2. mc_ai_jobs ────────────────────────────────────────────────────────────
-- Queue written by the frontend, consumed by the user's local Claude worker.
-- One row = one claude -p invocation. The worker sets status done/failed
-- and writes result/error back; the frontend subscribes via Supabase Realtime.

CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id   uuid REFERENCES mc_sessions(id) ON DELETE SET NULL,
  kind         text NOT NULL
    CHECK (kind IN ('tailor','score_job','classify_email','company_research','rewrite_line','test','other')),
  status       text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','done','failed','canceled')),
  model        text NOT NULL DEFAULT 'haiku-4-5',
  prompt       text NOT NULL,
  input        jsonb,
  result       text,
  result_json  jsonb,
  error        text,
  attempts     integer NOT NULL DEFAULT 0,
  priority     integer NOT NULL DEFAULT 5,
  created_at   timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

CREATE INDEX IF NOT EXISTS mc_ai_jobs_user_status_idx
  ON mc_ai_jobs (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS mc_ai_jobs_session_idx
  ON mc_ai_jobs (session_id, created_at DESC);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 3. deleted_at on mc_tracked_jobs ─────────────────────────────────────────
-- Soft-delete column: jobs with a non-null deleted_at are "trashed" and hidden
-- from the board but recoverable via the Trash dialog. Referenced by BoardTab,
-- TrashDialog, StatsTab, DiscoverTab, and MyCollectionPage.

ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial index for fast trash lookups (WHERE deleted_at IS NOT NULL)
CREATE INDEX IF NOT EXISTS mc_tracked_deleted_idx
  ON mc_tracked_jobs (session_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- Reverse:
--   DROP TABLE mc_ai_jobs, mc_worker_heartbeats CASCADE;
--   ALTER TABLE mc_tracked_jobs DROP COLUMN IF EXISTS deleted_at;
--   DROP INDEX IF EXISTS mc_tracked_deleted_idx;
-- ============================================================================

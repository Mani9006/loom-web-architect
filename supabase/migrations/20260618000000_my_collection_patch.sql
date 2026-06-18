-- ============================================================================
-- My Collection — patch migration
-- Adds missing tables and columns that the TypeScript types and frontend code
-- reference but were absent from the initial my_collection migration.
-- ============================================================================

-- ── 1. deleted_at on mc_tracked_jobs (soft-delete / Trash feature) ────────
-- BoardTab, TrashDialog, DiscoverTab, and StatsTab all filter on this column.

ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS mc_tracked_deleted_at_idx
  ON mc_tracked_jobs (session_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ── 2. mc_ai_jobs — local-worker AI job queue ─────────────────────────────
-- The frontend inserts jobs here; the user's Mac mini worker picks them up,
-- runs claude -p locally, and writes results back.

CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id   uuid REFERENCES mc_sessions(id) ON DELETE CASCADE,
  kind         text NOT NULL,
    -- tailor | score_job | classify_email | company_research | rewrite_line | test | other
  status       text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed', 'canceled')),
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
  ON mc_ai_jobs (user_id, status, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS mc_ai_jobs_session_idx
  ON mc_ai_jobs (session_id, created_at DESC);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;

-- Users can insert their own jobs and read/update their own jobs.
CREATE POLICY "mc_ai_jobs_owner_select" ON mc_ai_jobs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "mc_ai_jobs_owner_insert" ON mc_ai_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mc_ai_jobs_owner_update" ON mc_ai_jobs
  FOR UPDATE USING (auth.uid() = user_id);

-- ── 3. mc_worker_heartbeats — local Mac mini worker liveness ─────────────
-- The local worker upserts a row every ~30 seconds. WorkerStatusBadge reads
-- it to show whether the worker is online (last_seen < 90 seconds ago).

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen  timestamptz NOT NULL DEFAULT now(),
  hostname   text,
  version    text
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_heartbeats_owner_all" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

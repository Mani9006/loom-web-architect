-- ============================================================================
-- My Collection — missing tables and columns backfill
-- ============================================================================
-- This migration adds:
--   1. deleted_at column to mc_tracked_jobs (soft-delete support)
--   2. mc_ai_jobs table (local Claude worker job queue)
--   3. mc_worker_heartbeats table (worker liveness tracking)
-- ============================================================================

-- ── 1. Soft-delete support for mc_tracked_jobs ────────────────────────────
-- The application code references deleted_at in all board queries but the
-- initial migration omitted the column. Added here as a safe ALTER.

ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS mc_tracked_deleted_idx
  ON mc_tracked_jobs (session_id, deleted_at)
  WHERE deleted_at IS NULL;

-- ── 2. AI job queue (local Claude worker) ─────────────────────────────────
-- The frontend never calls Anthropic directly. It inserts a row here; the
-- user's local worker (running `claude -p` against their Max plan) picks it
-- up within a few seconds and writes the result back.

CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    uuid REFERENCES mc_sessions(id) ON DELETE SET NULL,
  kind          text NOT NULL
    CHECK (kind IN ('tailor','score_job','classify_email','company_research','rewrite_line','test','other')),
  status        text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','done','failed','canceled')),
  model         text NOT NULL DEFAULT 'haiku-4-5'
    CHECK (model IN ('haiku-4-5','sonnet-4-6')),
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
  ON mc_ai_jobs (user_id, status, priority DESC, created_at ASC)
  WHERE status IN ('queued','running');

CREATE INDEX IF NOT EXISTS mc_ai_jobs_session_idx
  ON mc_ai_jobs (session_id, created_at DESC);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Allow realtime subscriptions for job status updates
ALTER PUBLICATION supabase_realtime ADD TABLE mc_ai_jobs;

-- ── 3. Worker heartbeats ──────────────────────────────────────────────────
-- The local worker writes a heartbeat row every 30 seconds. The frontend
-- reads this to show the "AI ready / AI offline" badge.
-- One row per user (upserted by worker on each heartbeat).

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname      text,
  worker_version text,
  last_seen     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_heartbeat_owner_all" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Reverse with:
--   ALTER TABLE mc_tracked_jobs DROP COLUMN IF EXISTS deleted_at;
--   DROP TABLE mc_worker_heartbeats CASCADE;
--   DROP TABLE mc_ai_jobs CASCADE;
-- ============================================================================

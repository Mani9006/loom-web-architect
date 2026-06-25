-- ============================================================================
-- My Collection — schema fix & missing tables
-- ============================================================================
-- This migration adds the three schema elements that were missing from the
-- original 20260427120000_my_collection.sql:
--
--   1. mc_tracked_jobs.deleted_at  — required for soft-delete / Trash flow
--   2. mc_ai_jobs                  — local Claude worker job queue
--   3. mc_worker_heartbeats        — worker online-status tracking
-- ============================================================================

-- ── 1. Add deleted_at to mc_tracked_jobs ─────────────────────────────────
-- Soft-delete column. NULL = live on the board; non-NULL = in the trash.
-- All board queries filter .is("deleted_at", null). The Trash dialog queries
-- .not("deleted_at", "is", null).

ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS mc_tracked_deleted_idx
  ON mc_tracked_jobs (session_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ── 2. mc_ai_jobs — local Claude worker job queue ─────────────────────────
-- The website never calls Anthropic API directly. It inserts a row here and
-- the user's local worker picks it up, runs `claude -p`, and writes back the
-- result. Frontend helpers live in src/lib/mc-ai-jobs.ts.

CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    uuid REFERENCES mc_sessions(id) ON DELETE SET NULL,
  kind          text NOT NULL DEFAULT 'other'
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

-- Worker picks up the oldest queued job with the highest priority first.
CREATE INDEX IF NOT EXISTS mc_ai_jobs_pickup_idx
  ON mc_ai_jobs (user_id, status, priority DESC, created_at ASC)
  WHERE status = 'queued';

-- Frontend uses this to re-attach to an in-flight job on remount.
CREATE INDEX IF NOT EXISTS mc_ai_jobs_user_session_idx
  ON mc_ai_jobs (user_id, session_id, created_at DESC);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own jobs.
CREATE POLICY "mc_ai_jobs_owner_select" ON mc_ai_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "mc_ai_jobs_owner_insert" ON mc_ai_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow the frontend to cancel jobs (status → 'canceled').
-- The worker updates status, result, error, started_at, finished_at, attempts.
CREATE POLICY "mc_ai_jobs_owner_update" ON mc_ai_jobs
  FOR UPDATE USING (auth.uid() = user_id);

-- Enable realtime on mc_ai_jobs so waitForJob() picks up changes instantly
-- instead of relying purely on the polling fallback. Run from the Supabase
-- dashboard if this migration is applied manually:
--   ALTER PUBLICATION supabase_realtime ADD TABLE mc_ai_jobs;

-- ── 3. mc_worker_heartbeats — worker online status ─────────────────────────
-- The user's local worker upserts this row every 30 s. The website checks
-- whether last_seen is within 90 s to show the "AI ready" / "AI offline" badge.

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen   timestamptz NOT NULL DEFAULT now(),
  hostname    text,
  worker_version text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_heartbeats_owner_all" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER mc_heartbeats_touch_updated_at
  BEFORE UPDATE ON mc_worker_heartbeats
  FOR EACH ROW EXECUTE FUNCTION mc_touch_updated_at();

-- ============================================================================
-- Done. To reverse:
--   ALTER TABLE mc_tracked_jobs DROP COLUMN IF EXISTS deleted_at;
--   DROP TABLE IF EXISTS mc_ai_jobs CASCADE;
--   DROP TABLE IF EXISTS mc_worker_heartbeats CASCADE;
-- ============================================================================

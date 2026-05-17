-- ============================================================================
-- My Collection — AI job queue + soft-delete support
-- ============================================================================
-- This migration adds:
--   1. mc_ai_jobs — job queue for the local Claude worker
--   2. mc_worker_heartbeats — worker health monitoring
--   3. deleted_at column on mc_tracked_jobs — soft-delete / Trash feature
-- ============================================================================

-- ── 1. deleted_at on mc_tracked_jobs ────────────────────────────────────────
-- The Board filters WHERE deleted_at IS NULL. The TrashDialog shows WHERE
-- deleted_at IS NOT NULL. Restore sets deleted_at back to NULL.

ALTER TABLE mc_tracked_jobs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS mc_tracked_deleted_idx
  ON mc_tracked_jobs (session_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ── 2. AI job queue ──────────────────────────────────────────────────────────
-- The frontend inserts here; the user's local Claude worker polls/subscribes,
-- runs the prompt, and writes result back. Status flow:
--   queued → running → done | failed | canceled

CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    uuid REFERENCES mc_sessions(id) ON DELETE CASCADE,
  kind          text NOT NULL DEFAULT 'other'
    CHECK (kind IN ('tailor','score_job','classify_email','company_research',
                    'rewrite_line','test','other')),
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

CREATE INDEX IF NOT EXISTS mc_ai_jobs_queue_idx
  ON mc_ai_jobs (user_id, status, priority DESC, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS mc_ai_jobs_session_idx
  ON mc_ai_jobs (session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Enable realtime for job status polling
ALTER PUBLICATION supabase_realtime ADD TABLE mc_ai_jobs;

-- ── 3. Worker heartbeats ─────────────────────────────────────────────────────
-- The local worker upserts here every 30 s. Frontend reads the last_seen
-- timestamp to decide whether AI features are currently available.

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname      text,
  worker_version text,
  last_seen     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_heartbeats_owner_all" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Reverse with:
--   ALTER TABLE mc_tracked_jobs DROP COLUMN IF EXISTS deleted_at;
--   DROP TABLE mc_worker_heartbeats CASCADE;
--   DROP TABLE mc_ai_jobs CASCADE;
-- ============================================================================

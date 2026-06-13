-- ============================================================================
-- My Collection — AI job queue + local worker heartbeat tables.
--
-- The frontend never calls Anthropic API directly. Instead:
--   1. It inserts a row into mc_ai_jobs.
--   2. The user's local worker process picks it up, runs `claude -p`, and
--      writes the result back (status → done, result text populated).
--   3. The frontend polls / subscribes via Supabase Realtime until done.
--
-- mc_worker_heartbeats lets the UI show whether the worker is online so
-- users know whether AI features are currently available.
-- ============================================================================

-- ── 1. AI job queue ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    uuid REFERENCES mc_sessions(id) ON DELETE SET NULL,
  kind          text NOT NULL,
    -- tailor | score_job | classify_email | company_research | rewrite_line | test | other
  status        text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed', 'canceled')),
  model         text NOT NULL DEFAULT 'haiku-4-5',
  prompt        text NOT NULL,
  input         jsonb,                   -- optional structured metadata
  result        text,                    -- primary text output from the AI
  result_json   jsonb,                   -- structured output when the prompt produces JSON
  error         text,                    -- error message when status = 'failed'
  attempts      integer NOT NULL DEFAULT 0,
  priority      integer NOT NULL DEFAULT 5,
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

-- Hot-path: worker polls for queued jobs ordered by priority DESC, created_at ASC.
CREATE INDEX IF NOT EXISTS mc_ai_jobs_worker_queue_idx
  ON mc_ai_jobs (user_id, status, priority DESC, created_at)
  WHERE status IN ('queued', 'running');

-- Frontend subscribes to its own pending jobs.
CREATE INDEX IF NOT EXISTS mc_ai_jobs_session_idx
  ON mc_ai_jobs (session_id, created_at DESC);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 2. Worker heartbeat ──────────────────────────────────────────────────────
-- The worker upserts this row every 30 seconds. UI shows "AI ready" when
-- last_seen < 90 seconds ago.

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname  text,
  last_seen timestamptz NOT NULL DEFAULT now(),
  version   text
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_heartbeat_owner_all" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Reverse:
--   DROP TABLE mc_ai_jobs, mc_worker_heartbeats CASCADE;
-- ============================================================================

-- ============================================================================
-- My Collection — AI job queue and worker heartbeat tables.
-- The frontend enqueues work here; the user's local Claude worker picks up
-- rows, executes claude -p, and writes results back. Realtime + polling
-- both watch for status changes.
-- ============================================================================

-- ── 1. AI job queue ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id   uuid REFERENCES mc_sessions(id) ON DELETE SET NULL,
  kind         text NOT NULL,
    -- tailor | score_job | classify_email | company_research | rewrite_line | test | other
  status       text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','done','failed','canceled')),
  model        text NOT NULL DEFAULT 'haiku-4-5',
  prompt       text NOT NULL,
  input        jsonb,
  result       text,          -- raw text output from the worker
  result_json  jsonb,         -- parsed JSON output, if the prompt produced JSON
  error        text,
  attempts     integer NOT NULL DEFAULT 0,
  priority     integer NOT NULL DEFAULT 5,
  created_at   timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

-- Worker polls for status='queued' ordered by priority DESC, created_at ASC.
CREATE INDEX IF NOT EXISTS mc_ai_jobs_pending_idx
  ON mc_ai_jobs (user_id, status, priority DESC, created_at ASC)
  WHERE status = 'queued';

-- Frontend watches for updates on a specific job id via realtime.
CREATE INDEX IF NOT EXISTS mc_ai_jobs_session_idx
  ON mc_ai_jobs (session_id, created_at DESC);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Enable realtime so the frontend's supabase.channel().on('postgres_changes')
-- can receive UPDATE events when the worker changes status/result.
ALTER PUBLICATION supabase_realtime ADD TABLE mc_ai_jobs;

-- ── 2. Worker heartbeats ─────────────────────────────────────────────────
-- One row per user. The Mac mini worker upserts this every 30s while running.
-- The frontend reads it to show "AI ready / offline" badge in the session header.
CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname   text,
  version    text,
  last_seen  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;
-- Worker writes its own heartbeat; frontend reads it.
CREATE POLICY "mc_heartbeat_owner_all" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Reverse:
--   DROP TABLE mc_ai_jobs, mc_worker_heartbeats CASCADE;
-- ============================================================================

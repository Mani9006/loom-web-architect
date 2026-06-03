-- ============================================================================
-- My Collection — AI job queue + worker heartbeat tables.
-- These tables back the local-Claude worker pipeline: the frontend inserts
-- a row into mc_ai_jobs, the user's Mac mini picks it up, runs `claude -p`,
-- and writes the result back. mc_worker_heartbeats tracks whether the worker
-- is currently online (heartbeat every 30s, timeout at 90s).
-- ============================================================================

-- ── AI job queue ─────────────────────────────────────────────────────────
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
  attempts      integer NOT NULL DEFAULT 0,
  priority      integer NOT NULL DEFAULT 5,
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

CREATE INDEX IF NOT EXISTS mc_ai_jobs_user_status_idx
  ON mc_ai_jobs (user_id, status, priority DESC, created_at ASC);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;

-- Users can enqueue their own jobs.
CREATE POLICY "mc_ai_jobs_owner_insert" ON mc_ai_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can read their own jobs (frontend polls for results).
CREATE POLICY "mc_ai_jobs_owner_select" ON mc_ai_jobs
  FOR SELECT USING (auth.uid() = user_id);

-- Worker updates the row (status, result, error). The worker authenticates
-- as the user whose job it's running, so uid() matches.
CREATE POLICY "mc_ai_jobs_owner_update" ON mc_ai_jobs
  FOR UPDATE USING (auth.uid() = user_id);

-- Enable realtime so the frontend can subscribe to row changes.
ALTER PUBLICATION supabase_realtime ADD TABLE mc_ai_jobs;

-- ── Worker heartbeat ──────────────────────────────────────────────────────
-- One row per user. The Mac mini worker upserts this every 30s.
-- "Online" = last_seen within the last 90 seconds.

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname  text,
  version   text,
  last_seen timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_heartbeat_owner_all" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

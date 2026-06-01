-- ============================================================================
-- My Collection — AI job queue (mc_ai_jobs) + worker heartbeats
-- ============================================================================
-- The website never calls Anthropic API directly. Instead it inserts a row
-- here. The user's Mac mini worker polls this table, runs `claude -p` locally
-- using their Max plan, and writes the result back. This decouples cost and
-- rate limits from the hosted app.

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

-- Worker polls for queued jobs ordered by priority then age.
CREATE INDEX IF NOT EXISTS mc_ai_jobs_worker_poll_idx
  ON mc_ai_jobs (user_id, status, priority DESC, created_at ASC)
  WHERE status IN ('queued', 'running');

-- Frontend looks up its own jobs by user + recency.
CREATE INDEX IF NOT EXISTS mc_ai_jobs_user_recent_idx
  ON mc_ai_jobs (user_id, created_at DESC);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Realtime must be enabled on this table for waitForJob() to work without
-- relying solely on the 4-second fallback poll. Enable in Supabase dashboard
-- under Database → Realtime → mc_ai_jobs.

-- ── Worker heartbeats ─────────────────────────────────────────────────────
-- The worker UPSERTs a row here every 30 s. WorkerStatusBadge reads it to
-- show the "AI ready / AI offline" indicator in the session header.
-- UNIQUE(user_id) means there's one row per user regardless of how many
-- machines they run the worker on (last writer wins).

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname      text,
  last_seen     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;

-- Frontend only reads; worker writes (usually via service-role key, but
-- also works with the user JWT for local dev).
CREATE POLICY "mc_heartbeats_owner_select" ON mc_worker_heartbeats
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "mc_heartbeats_owner_upsert" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Reverse:
--   DROP TABLE mc_worker_heartbeats, mc_ai_jobs CASCADE;
-- ============================================================================

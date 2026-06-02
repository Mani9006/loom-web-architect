-- ============================================================================
-- My Collection — AI job queue (mc_ai_jobs)
-- ============================================================================
-- The frontend library src/lib/mc-ai-jobs.ts inserts jobs here; the user's
-- local Mac mini worker polls this table, runs Claude, and writes results
-- back. This keeps all heavy AI work off the web server and on the user's
-- own hardware.
--
-- Kind values: tailor | score_job | classify_email | company_research | rewrite_line
-- Status lifecycle: queued → running → done | failed | canceled
-- ============================================================================

CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    uuid REFERENCES mc_sessions(id) ON DELETE CASCADE,

  -- What the worker should do and which model to use.
  kind          text NOT NULL,
  model         text NOT NULL DEFAULT 'haiku-4-5',

  -- The full prompt text sent to Claude (can be large).
  prompt        text,

  -- Structured metadata alongside the prompt (tracked_job_id, company, etc).
  input         jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Worker writes results here.
  result        text,        -- raw text output (e.g. tailored resume markdown)
  result_json   jsonb,       -- structured output (e.g. scores, research)
  error         text,        -- last error message if status = 'failed'

  -- Scheduling fields.
  status        text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed', 'canceled')),
  attempts      integer NOT NULL DEFAULT 0,
  priority      integer NOT NULL DEFAULT 0,  -- higher = more urgent

  -- Timestamps.
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

-- Worker polls by (user_id, status=queued) ordered by priority DESC, created_at ASC.
CREATE INDEX IF NOT EXISTS mc_ai_jobs_queue_idx
  ON mc_ai_jobs (user_id, status, priority DESC, created_at)
  WHERE status = 'queued';

-- Session-scoped lookup for re-attaching to in-flight jobs after a page reload.
CREATE INDEX IF NOT EXISTS mc_ai_jobs_session_idx
  ON mc_ai_jobs (session_id, created_at DESC);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;

-- Users can only see and modify their own AI jobs.
CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

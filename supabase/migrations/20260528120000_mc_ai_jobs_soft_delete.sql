-- ============================================================================
-- My Collection — AI job queue, worker heartbeats, and soft-delete
-- ============================================================================
-- ADDITIVE ONLY. Adds the missing infrastructure for:
--   1. mc_ai_jobs          — local-Claude job queue (critical for all AI features)
--   2. mc_worker_heartbeats — worker liveness tracking (WorkerStatusBadge)
--   3. deleted_at column   — soft-delete for kanban cards (Trash dialog)
-- ============================================================================

-- ── 1. Soft-delete column on mc_tracked_jobs ──────────────────────────────
-- BoardTab and TrashDialog filter on deleted_at IS NULL / IS NOT NULL.
-- Missing column caused all soft-delete queries to fail with a Supabase error.

ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial index — only non-null rows are indexed, keeping it tiny.
CREATE INDEX IF NOT EXISTS mc_tracked_deleted_at_idx
  ON mc_tracked_jobs (session_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ── 2. AI job queue ────────────────────────────────────────────────────────
-- The website inserts rows here; the user's local worker picks them up,
-- runs `claude -p`, and writes the result back. This table is the contract
-- between the frontend and the local Claude runner.
--
-- kind: tailor | score_job | classify_email | company_research |
--        rewrite_line | test | other
-- status: queued → running → done | failed | canceled
-- model: haiku-4-5 | sonnet-4-6  (no Opus — cost control)

CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    uuid        REFERENCES mc_sessions(id) ON DELETE CASCADE,
  kind          text        NOT NULL,
  status        text        NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','done','failed','canceled')),
  model         text        NOT NULL,
  prompt        text        NOT NULL,
  input         jsonb,
  result        text,
  result_json   jsonb,
  error         text,
  attempts      integer     NOT NULL DEFAULT 0,
  priority      integer     NOT NULL DEFAULT 5,
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

CREATE INDEX IF NOT EXISTS mc_ai_jobs_worker_poll_idx
  ON mc_ai_jobs (user_id, status, priority DESC, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS mc_ai_jobs_session_idx
  ON mc_ai_jobs (session_id, created_at DESC);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;

-- Owners can read and write their own jobs.
CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Workers need to update status/result even when running as service_role.
-- (If you run the worker as a different role, add a service_role policy here.)

-- ── 3. Worker heartbeats ──────────────────────────────────────────────────
-- The local worker upserts a row here every 30 s. WorkerStatusBadge reads
-- it to show "AI ready" vs "AI offline". One row per user (last writer wins).

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  user_id     uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname    text,
  worker_ver  text,
  last_seen   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_heartbeats_owner_all" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Reverse with:
--   DROP TABLE mc_worker_heartbeats, mc_ai_jobs CASCADE;
--   ALTER TABLE mc_tracked_jobs DROP COLUMN deleted_at;
-- ============================================================================

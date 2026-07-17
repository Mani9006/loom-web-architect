-- ============================================================================
-- My Collection — AI job queue, worker heartbeats, board soft-delete
-- ============================================================================
-- These tables/columns are already live in production — see the generated
-- src/integrations/supabase/types.ts, which reflects the real schema — but
-- none of them were ever captured in a committed migration. Provisioning a
-- fresh environment (a new Supabase project, CI, local dev, disaster
-- recovery) from the migrations in this repo alone silently breaks:
--   - mc_ai_jobs        → the whole AI job queue (Discover "Find jobs with
--                          AI", Board/Discover "Tailor with AI") since
--                          src/lib/mc-ai-jobs.ts inserts/selects/subscribes
--                          against this table.
--   - mc_worker_heartbeats → the "AI ready / AI offline" badge.
--   - mc_tracked_jobs.deleted_at → the board's soft-delete/Trash/undo flow
--                          (BoardTab, TrashDialog, MyCollectionPage stats
--                          all filter on this column).
-- This migration is ADDITIVE ONLY, matching the my_collection migrations
-- before it.
-- ============================================================================

-- ── AI job queue (frontend enqueues, the user's local worker executes) ─────
CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    uuid REFERENCES mc_sessions(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  status        text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed', 'canceled')),
  model         text NOT NULL DEFAULT 'sonnet-4-6',
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
  ON mc_ai_jobs (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS mc_ai_jobs_session_idx
  ON mc_ai_jobs (session_id);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Worker heartbeats — one row per user, upserted by the local worker ─────
CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen   timestamptz NOT NULL DEFAULT now(),
  hostname    text,
  version     text
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_worker_heartbeats_owner_all" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Soft-delete support for board cards (Trash dialog + undo toast) ────────
ALTER TABLE mc_tracked_jobs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS mc_tracked_jobs_session_deleted_idx
  ON mc_tracked_jobs (session_id, deleted_at);

-- ============================================================================
-- Reverse:
--   ALTER TABLE mc_tracked_jobs DROP COLUMN deleted_at;
--   DROP TABLE mc_worker_heartbeats, mc_ai_jobs CASCADE;
-- ============================================================================

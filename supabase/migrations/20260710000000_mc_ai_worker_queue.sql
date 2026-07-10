-- ============================================================================
-- My Collection — AI job queue, worker heartbeats, and trash support
-- ============================================================================
-- These objects already exist in the live database (see
-- src/integrations/supabase/types.ts, which is generated from it, and
-- src/lib/mc-ai-jobs.ts / TrashDialog.tsx / BoardTab.tsx, which depend on
-- them) but were never captured as a migration file, so a fresh database
-- built from `supabase/migrations` alone would be missing them. This
-- migration is a reconstruction, guarded to be a no-op wherever the objects
-- already exist.
-- ============================================================================

-- ── Soft-delete support for kanban cards ───────────────────────────────
-- BoardTab filters on deleted_at IS NULL; TrashDialog lists deleted_at IS
-- NOT NULL and can restore (deleted_at = NULL) or hard-delete.

ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS mc_tracked_deleted_idx
  ON mc_tracked_jobs (session_id, deleted_at);

-- ── AI job queue ────────────────────────────────────────────────────────
-- The website never calls Anthropic directly for My Collection AI features.
-- It inserts a row here; the user's local worker (running `claude -p` on
-- their own Max plan) picks it up, does the work, and writes the result
-- back. See src/lib/mc-ai-jobs.ts for the frontend side of this queue.

CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id        uuid REFERENCES mc_sessions(id) ON DELETE CASCADE,
  kind              text NOT NULL,
  status            text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed', 'canceled')),
  model             text NOT NULL DEFAULT 'haiku-4-5',
  prompt            text NOT NULL,
  input             jsonb,
  result            text,
  result_json       jsonb,
  error             text,
  attempts          integer NOT NULL DEFAULT 0,
  priority          integer NOT NULL DEFAULT 5,
  created_at        timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  finished_at       timestamptz
);

CREATE INDEX IF NOT EXISTS mc_ai_jobs_user_status_idx
  ON mc_ai_jobs (user_id, status, created_at);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'mc_ai_jobs' AND policyname = 'mc_ai_jobs_owner_all'
  ) THEN
    CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Frontend subscribes to row updates via Supabase realtime (waitForJob in
-- src/lib/mc-ai-jobs.ts) with a polling fallback, so this is best-effort —
-- harmless if the publication doesn't exist (e.g. local Supabase CLI).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND tablename = 'mc_ai_jobs'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mc_ai_jobs;
  END IF;
END $$;

-- ── Worker heartbeats ───────────────────────────────────────────────────
-- The local worker writes a heartbeat every ~30s. WorkerStatusBadge reads
-- this to show "AI ready" / "AI offline" (isWorkerOnline in mc-ai-jobs.ts).

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname          text,
  version           text,
  last_seen         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'mc_worker_heartbeats' AND policyname = 'mc_worker_heartbeats_owner_all'
  ) THEN
    CREATE POLICY "mc_worker_heartbeats_owner_all" ON mc_worker_heartbeats
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================================
-- Reverse:
--   ALTER TABLE mc_tracked_jobs DROP COLUMN IF EXISTS deleted_at;
--   DROP TABLE IF EXISTS mc_ai_jobs, mc_worker_heartbeats CASCADE;
-- ============================================================================

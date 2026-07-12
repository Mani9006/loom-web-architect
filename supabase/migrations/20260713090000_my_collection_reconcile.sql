-- ============================================================================
-- My Collection — reconcile migrations with production schema
-- ============================================================================
-- Three pieces of the My Collection feature were applied directly to the
-- production Supabase project (per commit c98dd71: "Schema dependency:
-- mc_ai_jobs and mc_worker_heartbeats tables must exist (already applied in
-- the user's Supabase)") without ever being committed as a migration. Any
-- fresh environment — a new contributor's local Supabase, CI, staging, or a
-- disaster-recovery restore from migrations — cannot reconstruct the schema
-- that src/lib/mc-ai-jobs.ts, WorkerStatusBadge, BoardTab, and TrashDialog
-- all depend on. This migration is written to be idempotent (IF NOT EXISTS
-- everywhere) so it is a no-op against the production database that already
-- has this schema, while correctly bootstrapping any environment that
-- doesn't.
-- ============================================================================

-- ── 1. Soft-delete support on tracked jobs (powers the Trash dialog) ───────

ALTER TABLE mc_tracked_jobs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS mc_tracked_session_deleted_idx
  ON mc_tracked_jobs (session_id, deleted_at);

-- ── 2. AI job queue — the local-worker pipeline (Discover + Tailor) ────────
-- The website never calls Anthropic directly. It inserts a row here; the
-- user's own machine runs a worker that watches for queued rows, executes
-- the prompt locally, and writes the result back. The worker authenticates
-- as the owning user, so ownership-scoped RLS (not a service role) is the
-- correct model — mirrors every other mc_* table in this feature.

CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id        uuid REFERENCES mc_sessions(id) ON DELETE CASCADE,
  kind              text NOT NULL
    CHECK (kind IN ('tailor','score_job','classify_email','company_research','rewrite_line','test','other')),
  status            text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','done','failed','canceled')),
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
  ON mc_ai_jobs (user_id, status, priority, created_at);
CREATE INDEX IF NOT EXISTS mc_ai_jobs_session_idx
  ON mc_ai_jobs (session_id);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mc_ai_jobs' AND policyname = 'mc_ai_jobs_owner_all'
  ) THEN
    CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Realtime so the frontend's waitForJob() postgres_changes subscription
-- resolves instantly instead of relying on its 4s polling fallback.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'mc_ai_jobs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE mc_ai_jobs;
    END IF;
  END IF;
END $$;

-- ── 3. Worker heartbeats (powers WorkerStatusBadge) ─────────────────────────
-- One row per user; the local worker upserts this every ~30s. "Online" means
-- a heartbeat within the last 90s (see isWorkerOnline in mc-ai-jobs.ts).

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
    SELECT 1 FROM pg_policies WHERE tablename = 'mc_worker_heartbeats' AND policyname = 'mc_worker_heartbeats_owner_all'
  ) THEN
    CREATE POLICY "mc_worker_heartbeats_owner_all" ON mc_worker_heartbeats
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================================
-- Reverse:
--   DROP TABLE mc_ai_jobs, mc_worker_heartbeats CASCADE;
--   ALTER TABLE mc_tracked_jobs DROP COLUMN deleted_at;
-- ============================================================================

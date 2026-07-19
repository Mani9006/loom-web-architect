-- ============================================================================
-- My Collection — AI job queue + worker heartbeats + trash (schema drift fix)
-- ============================================================================
-- The My Collection frontend (src/lib/mc-ai-jobs.ts, DiscoverTab, BoardTab,
-- WorkerStatusBadge) has always queried mc_ai_jobs, mc_worker_heartbeats,
-- and mc_tracked_jobs.deleted_at (confirmed present in the generated
-- src/integrations/supabase/types.ts), but no migration in this repo ever
-- created them — they were applied directly against the live project,
-- outside of migration history. Any other environment created from these
-- migrations alone (a fresh `supabase db reset`, staging, disaster
-- recovery, a new contributor's local stack) is missing them, so every
-- AI-powered action (Find jobs with AI, Tailor with AI, the worker status
-- badge) and the board's Trash/Restore flow silently fail there with
-- "relation/column does not exist". This migration is additive only
-- (IF NOT EXISTS throughout) — a no-op against the current production
-- database, and a real fix everywhere else.
-- ============================================================================

-- ── AI job queue ────────────────────────────────────────────────────────
-- The website never calls Anthropic directly. It inserts a row here; the
-- user's local worker (running `claude -p` on their own machine/plan)
-- polls for queued rows, runs the prompt, and writes the result back.

CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id        uuid REFERENCES mc_sessions(id) ON DELETE CASCADE,
  kind              text NOT NULL
    CHECK (kind IN ('tailor','score_job','classify_email','company_research','rewrite_line','test','other')),
  status            text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','done','failed','canceled')),
  model             text NOT NULL,
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

CREATE INDEX IF NOT EXISTS mc_ai_jobs_status_priority_idx
  ON mc_ai_jobs (status, priority, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS mc_ai_jobs_user_idx
  ON mc_ai_jobs (user_id, created_at DESC);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Note: waitForJob() in src/lib/mc-ai-jobs.ts subscribes to postgres_changes
-- on this table for instant progress updates, with a 4s poll as a fallback.
-- If this project's `supabase_realtime` publication isn't set to broadcast
-- all tables, add mc_ai_jobs to it via the dashboard (Database > Replication)
-- so users see live status instead of the 4s-latency polling fallback.

-- ── Worker heartbeats ───────────────────────────────────────────────────
-- The local worker writes a heartbeat row every ~30s. WorkerStatusBadge
-- reads it to show "AI ready" vs "AI offline".

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname          text,
  last_seen         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_worker_heartbeats_owner_all" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Board trash (soft delete) ───────────────────────────────────────────
-- BoardTab / TrashDialog have always filtered/updated mc_tracked_jobs on a
-- deleted_at column that was never added to the original table.

ALTER TABLE mc_tracked_jobs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS mc_tracked_session_deleted_idx
  ON mc_tracked_jobs (session_id, deleted_at);

-- ============================================================================
-- Reverse with:
--   ALTER TABLE mc_tracked_jobs DROP COLUMN IF EXISTS deleted_at;
--   DROP TABLE IF EXISTS mc_worker_heartbeats, mc_ai_jobs CASCADE;
-- ============================================================================

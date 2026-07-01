-- ============================================================================
-- My Collection — repair schema drift + harden the active-session cap
-- ============================================================================
-- `mc_ai_jobs` and `mc_worker_heartbeats` were created directly against the
-- live database at some point (they appear in the generated Supabase types
-- and are used throughout src/lib/mc-ai-jobs.ts) but were never captured in
-- a migration. That means a fresh environment (staging, CI, disaster
-- recovery) rebuilt from supabase/migrations/*.sql would be missing both
-- tables entirely. This migration backfills them — CREATE TABLE IF NOT
-- EXISTS is a no-op against the current production database.
--
-- It also adds a DB-level trigger enforcing the "5 active sessions max"
-- rule. Previously that cap was only checked in the React UI
-- (src/pages/MyCollection/MyCollectionPage.tsx), so it was trivially
-- bypassable via the REST/JS client directly.
-- ============================================================================

-- ── mc_ai_jobs — local-worker AI job queue ─────────────────────────────
-- The frontend never calls Anthropic directly; it inserts a row here and
-- the user's local worker (running `claude -p`) polls for queued rows,
-- executes them, and writes the result back. See src/lib/mc-ai-jobs.ts.

CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id        uuid REFERENCES mc_sessions(id) ON DELETE SET NULL,
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
  ON mc_ai_jobs (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS mc_ai_jobs_status_priority_idx
  ON mc_ai_jobs (status, priority, created_at)
  WHERE status IN ('queued', 'running');

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── mc_worker_heartbeats — "is my AI worker online" status ─────────────
-- One row per user, upserted every ~30s by the local worker. Read by
-- WorkerStatusBadge to show an "AI ready" / "AI offline" indicator.

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname          text,
  version           text,
  last_seen         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "mc_worker_heartbeats_owner_all" ON mc_worker_heartbeats
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── mc_tracked_jobs.deleted_at — backfill (already live, missing from repo) ──
-- Powers the soft-delete / Trash flow (BoardTab, TrashDialog, StatsTab).

ALTER TABLE mc_tracked_jobs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS mc_tracked_jobs_deleted_at_idx
  ON mc_tracked_jobs (session_id, deleted_at);

-- ── Enforce the 5-active-session cap server-side ────────────────────────
-- The UI (MyCollectionPage ACTIVE_LIMIT) already blocks this, but nothing
-- stopped a direct REST/JS call from creating or reactivating past the cap.

CREATE OR REPLACE FUNCTION mc_enforce_active_session_cap() RETURNS trigger AS $$
DECLARE
  active_count integer;
BEGIN
  IF NEW.status = 'active' THEN
    SELECT count(*) INTO active_count
    FROM mc_sessions
    WHERE user_id = NEW.user_id
      AND status = 'active'
      AND id <> NEW.id;
    IF active_count >= 5 THEN
      RAISE EXCEPTION 'Active session limit reached (max 5 active sessions). Archive one before creating or reactivating another.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mc_sessions_enforce_active_cap ON mc_sessions;
CREATE TRIGGER mc_sessions_enforce_active_cap
  BEFORE INSERT OR UPDATE ON mc_sessions
  FOR EACH ROW EXECUTE FUNCTION mc_enforce_active_session_cap();

-- ============================================================================
-- Reverse:
--   DROP TRIGGER mc_sessions_enforce_active_cap ON mc_sessions;
--   DROP FUNCTION mc_enforce_active_session_cap();
--   ALTER TABLE mc_tracked_jobs DROP COLUMN deleted_at;
--   DROP TABLE mc_worker_heartbeats;
--   DROP TABLE mc_ai_jobs;
-- ============================================================================

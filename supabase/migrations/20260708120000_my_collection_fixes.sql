-- ============================================================================
-- My Collection — schema sync + hardening
-- ============================================================================
-- 1. mc_tracked_jobs.deleted_at, mc_ai_jobs, mc_worker_heartbeats already
--    exist in production (added out-of-band) but were never captured in a
--    migration file, so provisioning a fresh/staging DB from this repo's
--    migrations silently breaks Discover search, AI tailoring, worker
--    status, and the whole Trash flow. This migration is written so it is
--    safe to run against a database that already has these objects
--    (IF NOT EXISTS everywhere) as well as against a brand new one.
-- 2. mc_gmail_oauth_states is new — see supabase/functions/mc-gmail-connect
--    and mc-gmail-callback. It replaces shipping the user's live JWT
--    through Google's OAuth `state` parameter with a short-lived,
--    single-use, server-side nonce.
-- 3. A trigger enforces the "5 active sessions" cap server-side — it was
--    previously a client-side-only check in MyCollectionPage.tsx.
-- ============================================================================

-- ── 1a. mc_tracked_jobs.deleted_at (soft-delete / Trash) ───────────────────

ALTER TABLE mc_tracked_jobs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS mc_tracked_session_deleted_idx
  ON mc_tracked_jobs (session_id, deleted_at);

-- ── 1b. mc_ai_jobs (local-worker AI job queue) ──────────────────────────────

CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id        uuid REFERENCES mc_sessions(id) ON DELETE CASCADE,
  kind              text NOT NULL,
  status            text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed', 'canceled')),
  model             text NOT NULL DEFAULT 'sonnet-4-6',
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
  ON mc_ai_jobs (status, priority, created_at);
CREATE INDEX IF NOT EXISTS mc_ai_jobs_user_idx
  ON mc_ai_jobs (user_id, created_at DESC);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mc_ai_jobs' AND policyname = 'mc_ai_jobs_owner_all'
  ) THEN
    CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── 1c. mc_worker_heartbeats (local worker online/offline status) ──────────

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname          text,
  version           text,
  last_seen         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mc_worker_heartbeats' AND policyname = 'mc_worker_heartbeats_owner_all'
  ) THEN
    CREATE POLICY "mc_worker_heartbeats_owner_all" ON mc_worker_heartbeats
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── 2. mc_gmail_oauth_states (single-use OAuth handoff nonce) ──────────────
-- No RLS policies are defined on purpose: only the service role (used by
-- the mc-gmail-connect / mc-gmail-callback edge functions) may read or
-- write this table. RLS is still enabled as defense in depth.

CREATE TABLE IF NOT EXISTS mc_gmail_oauth_states (
  nonce             text PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id        uuid NOT NULL REFERENCES mc_sessions(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

CREATE INDEX IF NOT EXISTS mc_gmail_oauth_states_expires_idx
  ON mc_gmail_oauth_states (expires_at);

ALTER TABLE mc_gmail_oauth_states ENABLE ROW LEVEL SECURITY;

-- ── 3. Server-side enforcement of the 5-active-session cap ─────────────────
-- MyCollectionPage.tsx only disables the "New Session" button client-side;
-- nothing stopped a second tab or a direct API call from exceeding it.

CREATE OR REPLACE FUNCTION mc_enforce_active_session_cap() RETURNS trigger AS $$
DECLARE
  active_count integer;
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    SELECT count(*) INTO active_count
    FROM mc_sessions
    WHERE user_id = NEW.user_id AND status = 'active' AND id <> NEW.id;
    IF active_count >= 5 THEN
      RAISE EXCEPTION 'active session limit reached (max 5)';
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
--   DROP TABLE mc_gmail_oauth_states;
--   DROP TABLE mc_worker_heartbeats;
--   DROP TABLE mc_ai_jobs;
--   ALTER TABLE mc_tracked_jobs DROP COLUMN deleted_at;
-- ============================================================================

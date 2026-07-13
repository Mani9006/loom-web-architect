-- ============================================================================
-- My Collection — schema fixes and hardening
-- ============================================================================
-- This migration is ADDITIVE ONLY. It backfills tables/columns that had
-- drifted out of sync between the live database and the checked-in
-- migrations (mc_tracked_jobs.deleted_at, mc_ai_jobs, mc_worker_heartbeats),
-- adds a server-side cap on active sessions, and adds a short-lived OAuth
-- state table so the Gmail connect flow no longer has to round-trip the
-- user's Supabase JWT through Google's redirect chain.
-- ============================================================================

-- ── 1. Soft-delete support for tracked jobs (Board / Trash flow) ──────────
-- The frontend (BoardTab, TrashDialog, MyCollectionPage) has always read and
-- written this column; it just never made it into a migration.

ALTER TABLE mc_tracked_jobs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS mc_tracked_deleted_idx
  ON mc_tracked_jobs (session_id, deleted_at);

-- ── 2. Local-worker AI job queue ───────────────────────────────────────────
-- The frontend never calls an LLM API directly. It inserts a row here; a
-- worker running on the user's own machine polls this table, runs the model
-- locally, and writes the result back. See src/lib/mc-ai-jobs.ts.

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

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;

-- The browser (owner) can enqueue jobs and read/cancel its own.
CREATE POLICY "mc_ai_jobs_owner_select" ON mc_ai_jobs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "mc_ai_jobs_owner_insert" ON mc_ai_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mc_ai_jobs_owner_update" ON mc_ai_jobs
  FOR UPDATE USING (auth.uid() = user_id);

-- ── 3. Local-worker heartbeats ─────────────────────────────────────────────
-- One row per user, upserted every ~30s by their local worker so the
-- frontend (WorkerStatusBadge) can show online/offline.

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname          text,
  version           text,
  last_seen         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_worker_heartbeats_owner_all" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 4. Server-side enforcement of the active-session cap ──────────────────
-- The UI already limits users to 5 active sessions, but only client-side —
-- trivially bypassable via direct API calls and racy across tabs. Enforce
-- it with a trigger so the limit actually holds.

CREATE OR REPLACE FUNCTION mc_enforce_active_session_cap() RETURNS trigger AS $$
DECLARE
  active_count integer;
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    SELECT count(*) INTO active_count
      FROM mc_sessions
      WHERE user_id = NEW.user_id AND status = 'active' AND id <> NEW.id;
    IF active_count >= 5 THEN
      RAISE EXCEPTION 'active session limit reached (max 5)' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mc_sessions_enforce_active_cap ON mc_sessions;
CREATE TRIGGER mc_sessions_enforce_active_cap
  BEFORE INSERT OR UPDATE ON mc_sessions
  FOR EACH ROW EXECUTE FUNCTION mc_enforce_active_session_cap();

-- ── 5. Short-lived Gmail OAuth state (replaces JWT-in-state) ──────────────
-- Previously mc-gmail-connect base64-encoded the user's raw Supabase JWT
-- into the OAuth `state` param, which then traveled through Google's
-- consent redirect and back — exposed to browser history, Referer headers,
-- and any logs along the way. Instead we mint a random one-time token tied
-- server-side to (user_id, session_id) and pass only that opaque token as
-- `state`; the callback looks it up with the service-role key.

CREATE TABLE IF NOT EXISTS mc_gmail_oauth_state (
  token             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id        uuid NOT NULL REFERENCES mc_sessions(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

ALTER TABLE mc_gmail_oauth_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_gmail_oauth_state_owner_insert" ON mc_gmail_oauth_state
  FOR INSERT WITH CHECK (auth.uid() = user_id);
-- No SELECT/DELETE policy for regular users — only the service role (used by
-- mc-gmail-callback, which bypasses RLS) ever needs to read or consume these.

-- ============================================================================
-- Done. Reverse with:
--   DROP TRIGGER mc_sessions_enforce_active_cap ON mc_sessions;
--   DROP FUNCTION mc_enforce_active_session_cap();
--   DROP TABLE mc_gmail_oauth_state, mc_worker_heartbeats, mc_ai_jobs CASCADE;
--   ALTER TABLE mc_tracked_jobs DROP COLUMN deleted_at;
-- ============================================================================

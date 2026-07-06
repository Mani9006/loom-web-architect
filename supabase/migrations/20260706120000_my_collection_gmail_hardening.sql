-- ============================================================================
-- My Collection — Gmail integration hardening (ADDITIVE / SAFE)
-- ============================================================================

-- ── 1. Scope inbound-email dedup to the session, not the whole table ───────
-- `mc_inbound_emails.message_id` was globally UNIQUE, but a Gmail message_id
-- is only unique within a single mailbox. If the same Gmail account is ever
-- connected to more than one session, a message matched in session A would
-- make mc-gmail-poll treat the identical message_id as "already processed"
-- when polling session B, silently skipping a real status update for B.
-- Scoping the uniqueness (and the dedup lookup in mc-gmail-poll) to
-- (session_id, message_id) fixes that without changing any existing rows.

ALTER TABLE mc_inbound_emails DROP CONSTRAINT IF EXISTS mc_inbound_emails_message_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS mc_inbound_emails_session_message_key
  ON mc_inbound_emails (session_id, message_id);

-- ── 2. Single-use OAuth state store for the Gmail connect flow ─────────────
-- mc-gmail-connect used to embed the caller's live Supabase JWT directly in
-- the OAuth `state` param, which Google echoes back verbatim in the callback
-- redirect URL — exposing a working bearer token to Google's logs, browser
-- history, and any Referer-header leakage along the redirect chain. Instead,
-- mc-gmail-connect now mints a random single-use token here (mapped to the
-- already-authenticated user_id + session_id) and mc-gmail-callback resolves
-- + deletes it, so no credential ever appears in a URL.

CREATE TABLE IF NOT EXISTS mc_oauth_state (
  state       text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  uuid NOT NULL REFERENCES mc_sessions(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Only the service role (used by the edge functions) ever touches this
-- table directly; RLS with no policies denies all client access by default.
ALTER TABLE mc_oauth_state ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Reverse:
--   DROP INDEX mc_inbound_emails_session_message_key;
--   ALTER TABLE mc_inbound_emails ADD CONSTRAINT mc_inbound_emails_message_id_key UNIQUE (message_id);
--   DROP TABLE mc_oauth_state;
-- ============================================================================

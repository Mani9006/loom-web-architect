-- ============================================================================
-- My Collection — Gmail OAuth state table (security fix)
-- ============================================================================
-- mc-gmail-connect previously smuggled the user's raw Supabase JWT through
-- Google's OAuth `state` param (base64, not encrypted) so mc-gmail-callback
-- could act as that user on the way back. That JWT round-trips through
-- Google's servers and comes back as a URL query string, which routinely
-- ends up in browser history and server access logs — a real session-token
-- leak, not just a style issue.
--
-- This table replaces that with a short-lived, single-use opaque token:
-- mc-gmail-connect verifies the caller, stores {token -> user_id, session_id}
-- here, and puts only the random token in `state`. mc-gmail-callback looks
-- the token up (and deletes it — single use), so the real JWT never leaves
-- our own server.
-- ============================================================================

CREATE TABLE IF NOT EXISTS mc_gmail_oauth_state (
  token             text PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id        uuid NOT NULL REFERENCES mc_sessions(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

-- No RLS policies: only the service role (used by mc-gmail-connect and
-- mc-gmail-callback) ever touches this table directly. RLS is enabled with
-- no policies so it defaults to deny-all for anon/authenticated roles.
ALTER TABLE mc_gmail_oauth_state ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Reverse: DROP TABLE mc_gmail_oauth_state;
-- ============================================================================

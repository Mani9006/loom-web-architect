-- One-time Gmail OAuth state.
--
-- The browser receives only a random, opaque value. Its SHA-256 hash and the
-- user/workspace binding live in app_private. The callback atomically consumes
-- the row, which makes every state value expiring and single-use.
--
-- This migration is intentionally additive and is ordered after the Gmail
-- token/code hardening migrations already deployed to DEV.

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS app_private.mc_gmail_oauth_states (
  state_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  return_to text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mc_gmail_oauth_states_hash_format
    CHECK (state_hash ~ '^[A-Za-z0-9_-]{43}$'),
  CONSTRAINT mc_gmail_oauth_states_expiry_window
    CHECK (
      expires_at > created_at
      AND expires_at <= created_at + interval '15 minutes'
    ),
  CONSTRAINT mc_gmail_oauth_states_return_to_length
    CHECK (length(return_to) BETWEEN 1 AND 2048),
  CONSTRAINT mc_gmail_oauth_states_return_to_allowlist
    CHECK (
      return_to ~ '^https://(www\.)?resumepreps\.com/inbox$'
      OR return_to = 'https://loom-web-architect.vercel.app/inbox'
      OR return_to ~ '^https://loom-web-architect-[A-Za-z0-9-]+-maanys-projects-8bbfa798\.vercel\.app/inbox$'
      OR return_to ~ '^https?://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?/inbox$'
    ),
  CONSTRAINT mc_gmail_oauth_states_session_owner_fkey
    FOREIGN KEY (session_id, user_id)
    REFERENCES public.mc_sessions (id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS mc_gmail_oauth_states_pending_expiry_idx
  ON app_private.mc_gmail_oauth_states (expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE app_private.mc_gmail_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.mc_gmail_oauth_states FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE app_private.mc_gmail_oauth_states IS
  'Hashed, expiring, single-use Gmail OAuth state bound to one user workspace.';
COMMENT ON COLUMN app_private.mc_gmail_oauth_states.state_hash IS
  'Base64url SHA-256 of the opaque state sent through Google; the bearer value is never persisted.';

CREATE OR REPLACE FUNCTION public.mc_create_gmail_oauth_state(
  p_state_hash text,
  p_user_id uuid,
  p_session_id uuid,
  p_return_to text,
  p_expires_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := pg_catalog.statement_timestamp();
BEGIN
  IF p_state_hash IS NULL OR p_state_hash !~ '^[A-Za-z0-9_-]{43}$' THEN
    RAISE EXCEPTION 'invalid oauth state hash' USING ERRCODE = '22023';
  END IF;
  IF p_user_id IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'oauth state owner is required' USING ERRCODE = '22023';
  END IF;
  IF p_return_to IS NULL
    OR pg_catalog.length(p_return_to) NOT BETWEEN 1 AND 2048
    OR NOT (
      p_return_to ~ '^https://(www\.)?resumepreps\.com/inbox$'
      OR p_return_to = 'https://loom-web-architect.vercel.app/inbox'
      OR p_return_to ~ '^https://loom-web-architect-[A-Za-z0-9-]+-maanys-projects-8bbfa798\.vercel\.app/inbox$'
      OR p_return_to ~ '^https?://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?/inbox$'
    )
  THEN
    RAISE EXCEPTION 'invalid oauth return location' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at <= v_now OR p_expires_at > v_now + interval '15 minutes' THEN
    RAISE EXCEPTION 'invalid oauth state expiry' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.mc_sessions s
    WHERE s.id = p_session_id
      AND s.user_id = p_user_id
      AND s.status <> 'deleted'
  ) THEN
    RAISE EXCEPTION 'application workspace not found' USING ERRCODE = '22023';
  END IF;

  -- Keep one active connection attempt per workspace. Starting a new attempt
  -- invalidates an older tab and prevents an authenticated client from filling
  -- the private state table with valid but unused rows.
  DELETE FROM app_private.mc_gmail_oauth_states s
  WHERE s.user_id = p_user_id
    AND s.session_id = p_session_id;

  -- Opportunistic bounded cleanup avoids a long write transaction if an
  -- installation has accumulated old state rows.
  WITH expired AS (
    SELECT s.state_hash
    FROM app_private.mc_gmail_oauth_states s
    WHERE s.expires_at <= v_now
       OR s.consumed_at < v_now - interval '1 hour'
    ORDER BY s.expires_at
    LIMIT 1000
  )
  DELETE FROM app_private.mc_gmail_oauth_states s
  USING expired
  WHERE s.state_hash = expired.state_hash;

  INSERT INTO app_private.mc_gmail_oauth_states (
    state_hash,
    user_id,
    session_id,
    return_to,
    expires_at
  ) VALUES (
    p_state_hash,
    p_user_id,
    p_session_id,
    p_return_to,
    p_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mc_consume_gmail_oauth_state(
  p_state_hash text
) RETURNS TABLE (
  user_id uuid,
  session_id uuid,
  return_to text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_state_hash IS NULL OR p_state_hash !~ '^[A-Za-z0-9_-]{43}$' THEN
    RETURN;
  END IF;

  -- UPDATE ... WHERE consumed_at IS NULL is the replay barrier. Concurrent
  -- callbacks contend on the same row; only the first one can return it.
  RETURN QUERY
  UPDATE app_private.mc_gmail_oauth_states s
  SET consumed_at = pg_catalog.statement_timestamp()
  WHERE s.state_hash = p_state_hash
    AND s.consumed_at IS NULL
    AND s.expires_at > pg_catalog.statement_timestamp()
  RETURNING s.user_id, s.session_id, s.return_to;
END;
$$;

REVOKE ALL ON FUNCTION public.mc_create_gmail_oauth_state(
  text, uuid, uuid, text, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mc_consume_gmail_oauth_state(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mc_create_gmail_oauth_state(
  text, uuid, uuid, text, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.mc_consume_gmail_oauth_state(text)
  TO service_role;

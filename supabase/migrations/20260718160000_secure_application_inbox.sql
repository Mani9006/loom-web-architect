-- Secure Gmail token storage and short-lived application verification codes.
-- OAuth access/refresh tokens never remain in a table exposed through the API.

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO service_role;

CREATE TABLE IF NOT EXISTS app_private.mc_gmail_tokens (
  connection_id uuid PRIMARY KEY
    REFERENCES public.mc_gmail_connections(id) ON DELETE CASCADE,
  access_ciphertext text NOT NULL,
  refresh_ciphertext text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_private.mc_gmail_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.mc_gmail_tokens FROM PUBLIC, anon, authenticated;

ALTER TABLE public.mc_gmail_connections
  ALTER COLUMN access_token DROP NOT NULL,
  ALTER COLUMN refresh_token DROP NOT NULL;

-- Invalidate any unfinished legacy connection rather than retaining readable
-- OAuth credentials. Affected dev users reconnect once through the new flow.
UPDATE public.mc_gmail_connections
SET enabled = false, access_token = NULL, refresh_token = NULL
WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL;

ALTER TABLE public.mc_gmail_connections
  DROP COLUMN access_token,
  DROP COLUMN refresh_token;

CREATE OR REPLACE FUNCTION public.mc_store_gmail_tokens(
  p_connection_id uuid,
  p_access_ciphertext text,
  p_refresh_ciphertext text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO app_private.mc_gmail_tokens
    (connection_id, access_ciphertext, refresh_ciphertext, updated_at)
  VALUES
    (p_connection_id, p_access_ciphertext, p_refresh_ciphertext, now())
  ON CONFLICT (connection_id) DO UPDATE
  SET access_ciphertext = EXCLUDED.access_ciphertext,
      refresh_ciphertext = EXCLUDED.refresh_ciphertext,
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.mc_get_gmail_tokens(p_connection_id uuid)
RETURNS TABLE(access_ciphertext text, refresh_ciphertext text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT t.access_ciphertext, t.refresh_ciphertext
  FROM app_private.mc_gmail_tokens t
  WHERE t.connection_id = p_connection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mc_update_gmail_access_token(
  p_connection_id uuid,
  p_access_ciphertext text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE app_private.mc_gmail_tokens
  SET access_ciphertext = p_access_ciphertext, updated_at = now()
  WHERE connection_id = p_connection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mc_store_gmail_tokens(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mc_get_gmail_tokens(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mc_update_gmail_access_token(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mc_store_gmail_tokens(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mc_get_gmail_tokens(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mc_update_gmail_access_token(uuid, text) TO service_role;

ALTER TABLE public.mc_inbound_emails
  ADD COLUMN IF NOT EXISTS verification_code text,
  ADD COLUMN IF NOT EXISTS verification_code_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

ALTER TABLE public.mc_inbound_emails
  DROP CONSTRAINT IF EXISTS mc_inbound_emails_message_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS mc_emails_user_message_idx
  ON public.mc_inbound_emails (user_id, message_id);

CREATE INDEX IF NOT EXISTS mc_emails_unread_idx
  ON public.mc_inbound_emails (user_id, is_read, received_at DESC);

COMMENT ON COLUMN public.mc_inbound_emails.verification_code IS
  'Short-lived code extracted from an application email; cleared after expiry.';

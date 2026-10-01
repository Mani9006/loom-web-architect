-- Hosted application mailbox.
--
-- Every user can get an address on MAILBOX_DOMAIN (e.g. jane@<domain>) that
-- the Agent uses on job applications instead of the login email. Mail to it
-- arrives via Resend Inbound → inbound-email-webhook, is stored in
-- mc_inbound_emails (source = 'hosted') and forwarded to a verified address.
--
-- Additive and idempotent: no drops of existing objects or data. All writes
-- go through edge functions using the service role; signed-in users can only
-- read their own rows.

-- ── 1. Mailboxes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_mailboxes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  local_part          text NOT NULL UNIQUE
    CHECK (local_part = lower(local_part) AND local_part ~ '^[a-z0-9]{3,30}$'),
  domain              text NOT NULL CHECK (domain = lower(domain)),
  forward_to          text,
  forward_verified_at timestamptz,
  forwarding_enabled  boolean NOT NULL DEFAULT true,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_mailboxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_mailboxes_owner_select" ON public.user_mailboxes;
CREATE POLICY "user_mailboxes_owner_select" ON public.user_mailboxes
  FOR SELECT USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.user_mailboxes FROM anon, authenticated;
GRANT SELECT ON public.user_mailboxes TO authenticated;
GRANT ALL ON public.user_mailboxes TO service_role;

CREATE OR REPLACE FUNCTION public.user_mailboxes_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_mailboxes_touch_updated_at ON public.user_mailboxes;
CREATE TRIGGER user_mailboxes_touch_updated_at
  BEFORE UPDATE ON public.user_mailboxes
  FOR EACH ROW EXECUTE FUNCTION public.user_mailboxes_touch_updated_at();

-- ── 2. Source of inbound mail ────────────────────────────────────────────
ALTER TABLE public.mc_inbound_emails
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'gmail';

CREATE INDEX IF NOT EXISTS mc_emails_hosted_sender_idx
  ON public.mc_inbound_emails (user_id, source, from_email);

-- mc_inbound_emails keeps its owner-ALL policy (the inbox updates is_read).
-- Hosted rows are the allow-list for mailbox-send recipients, so clients must
-- not be able to create them or rewrite their sender/recipient/headers.
CREATE OR REPLACE FUNCTION public.mc_inbound_emails_guard_hosted() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.source = 'hosted' THEN
    RAISE EXCEPTION 'hosted mail can only be written by the mail service';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.source IS DISTINCT FROM OLD.source
    OR (OLD.source = 'hosted' AND (
      NEW.from_email IS DISTINCT FROM OLD.from_email
      OR NEW.to_email IS DISTINCT FROM OLD.to_email
      OR NEW.message_id IS DISTINCT FROM OLD.message_id
      OR NEW.raw IS DISTINCT FROM OLD.raw
    ))
  ) THEN
    RAISE EXCEPTION 'hosted mail fields are read-only';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mc_inbound_emails_guard_hosted ON public.mc_inbound_emails;
CREATE TRIGGER mc_inbound_emails_guard_hosted
  BEFORE INSERT OR UPDATE ON public.mc_inbound_emails
  FOR EACH ROW EXECUTE FUNCTION public.mc_inbound_emails_guard_hosted();

-- ── 3. Pending forwarding-address verification (private) ─────────────────
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO service_role;

CREATE TABLE IF NOT EXISTS app_private.mailbox_forward_verifications (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  target      text NOT NULL,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_private.mailbox_forward_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.mailbox_forward_verifications FROM PUBLIC, anon, authenticated;

-- app_private is not exposed through PostgREST; edge functions reach it via
-- these service-role-only RPCs (same pattern as mc_store_gmail_tokens).
-- Returns 'ok', or 'too_soon' when a code was issued less than 60 seconds
-- ago (limits how often we email an address the user typed in).
CREATE OR REPLACE FUNCTION public.mailbox_forward_code_put(
  p_user_id uuid,
  p_target text,
  p_code_hash text,
  p_expires_at timestamptz
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF EXISTS (
    SELECT 1 FROM app_private.mailbox_forward_verifications
    WHERE user_id = p_user_id AND created_at > now() - interval '60 seconds'
  ) THEN
    RETURN 'too_soon';
  END IF;
  INSERT INTO app_private.mailbox_forward_verifications
    (user_id, target, code_hash, expires_at, attempts, created_at)
  VALUES (p_user_id, lower(p_target), p_code_hash, p_expires_at, 0, now())
  ON CONFLICT (user_id) DO UPDATE
  SET target = EXCLUDED.target,
      code_hash = EXCLUDED.code_hash,
      expires_at = EXCLUDED.expires_at,
      attempts = 0,
      created_at = now();
  RETURN 'ok';
END;
$$;

-- Returns 'ok' (and consumes the code), 'invalid', 'expired', 'locked' or
-- 'missing'. Five wrong attempts discard the pending code.
CREATE OR REPLACE FUNCTION public.mailbox_forward_code_check(
  p_user_id uuid,
  p_target text,
  p_code_hash text,
  p_max_attempts integer DEFAULT 5
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_row app_private.mailbox_forward_verifications%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT * INTO v_row FROM app_private.mailbox_forward_verifications
  WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;
  IF v_row.expires_at < now() THEN
    DELETE FROM app_private.mailbox_forward_verifications WHERE user_id = p_user_id;
    RETURN 'expired';
  END IF;
  IF v_row.target = lower(p_target) AND v_row.code_hash = p_code_hash THEN
    DELETE FROM app_private.mailbox_forward_verifications WHERE user_id = p_user_id;
    RETURN 'ok';
  END IF;
  IF v_row.attempts + 1 >= p_max_attempts THEN
    DELETE FROM app_private.mailbox_forward_verifications WHERE user_id = p_user_id;
    RETURN 'locked';
  END IF;
  UPDATE app_private.mailbox_forward_verifications
  SET attempts = attempts + 1
  WHERE user_id = p_user_id;
  RETURN 'invalid';
END;
$$;

REVOKE ALL ON FUNCTION public.mailbox_forward_code_put(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mailbox_forward_code_check(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mailbox_forward_code_put(uuid, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.mailbox_forward_code_check(uuid, text, text, integer) TO service_role;

-- ── 4. Replies sent from the in-app inbox ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mailbox_outbound (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_email             text NOT NULL,
  subject              text,
  resend_id            text,
  in_reply_to_email_id uuid REFERENCES public.mc_inbound_emails(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mailbox_outbound_user_created_idx
  ON public.mailbox_outbound (user_id, created_at DESC);

ALTER TABLE public.mailbox_outbound ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mailbox_outbound_owner_select" ON public.mailbox_outbound;
CREATE POLICY "mailbox_outbound_owner_select" ON public.mailbox_outbound
  FOR SELECT USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.mailbox_outbound FROM anon, authenticated;
GRANT SELECT ON public.mailbox_outbound TO authenticated;
GRANT ALL ON public.mailbox_outbound TO service_role;

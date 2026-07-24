-- Employer verification codes are secrets, not inbox metadata.
--
-- Codes live in app_private as encrypted ciphertext. A running worker leases
-- one code, then acknowledges it only after the employer accepts the final
-- submission. Failed attempts release the lease; crashed leases expire.

ALTER TABLE public.mc_inbound_emails
  ADD COLUMN IF NOT EXISTS verification_code_available boolean NOT NULL DEFAULT false;

UPDATE public.mc_inbound_emails
SET verification_code = NULL,
    verification_code_available = false,
    verification_code_expires_at = NULL
WHERE verification_code IS NOT NULL;

ALTER TABLE public.mc_inbound_emails
  DROP CONSTRAINT IF EXISTS mc_inbound_emails_verification_code_private_check,
  ADD CONSTRAINT mc_inbound_emails_verification_code_private_check
    CHECK (verification_code IS NULL);

DROP INDEX IF EXISTS public.mc_emails_active_code_idx;
DROP INDEX IF EXISTS public.mc_emails_code_sweep_idx;

CREATE TABLE IF NOT EXISTS app_private.mc_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  tracked_job_id uuid NOT NULL,
  gmail_connection_id uuid NOT NULL,
  code_ciphertext text NOT NULL,
  expires_at timestamptz NOT NULL,
  reserved_task_id uuid REFERENCES public.applypass_tasks(id) ON DELETE SET NULL,
  reserved_worker_id text,
  reserved_at timestamptz,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mc_verification_code_email_owner_job_fkey
    FOREIGN KEY (email_id, user_id, tracked_job_id)
    REFERENCES public.mc_inbound_emails (id, user_id, tracked_job_id)
    ON DELETE CASCADE,
  CONSTRAINT mc_verification_code_tracked_job_owner_fkey
    FOREIGN KEY (tracked_job_id, user_id)
    REFERENCES public.mc_tracked_jobs (id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT mc_verification_code_connection_owner_session_fkey
    FOREIGN KEY (gmail_connection_id, user_id)
    REFERENCES public.mc_gmail_connections (id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS mc_verification_codes_active_job_idx
  ON app_private.mc_verification_codes (user_id, tracked_job_id, expires_at DESC)
  WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS mc_verification_codes_reserved_task_idx
  ON app_private.mc_verification_codes (reserved_task_id)
  WHERE reserved_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mc_verification_codes_connection_owner_idx
  ON app_private.mc_verification_codes (gmail_connection_id, user_id);

ALTER TABLE app_private.mc_verification_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.mc_verification_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app_private.mc_verification_codes FROM service_role;

CREATE OR REPLACE FUNCTION public.mc_store_verification_code(
  p_email_id uuid,
  p_user_id uuid,
  p_tracked_job_id uuid,
  p_gmail_connection_id uuid,
  p_code_ciphertext text,
  p_expires_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_expires_at <= now() OR coalesce(p_code_ciphertext, '') = '' THEN
    RAISE EXCEPTION 'invalid verification code lease';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.mc_inbound_emails e
    WHERE e.id = p_email_id
      AND e.user_id = p_user_id
      AND e.tracked_job_id = p_tracked_job_id
      AND e.gmail_connection_id = p_gmail_connection_id
  ) THEN
    RAISE EXCEPTION 'verification email relationship is invalid';
  END IF;

  INSERT INTO app_private.mc_verification_codes (
    email_id,
    user_id,
    tracked_job_id,
    gmail_connection_id,
    code_ciphertext,
    expires_at
  ) VALUES (
    p_email_id,
    p_user_id,
    p_tracked_job_id,
    p_gmail_connection_id,
    p_code_ciphertext,
    p_expires_at
  )
  ON CONFLICT (email_id) DO UPDATE
  SET code_ciphertext = EXCLUDED.code_ciphertext,
      expires_at = EXCLUDED.expires_at,
      reserved_task_id = NULL,
      reserved_worker_id = NULL,
      reserved_at = NULL,
      used_at = NULL;

  UPDATE public.mc_inbound_emails
  SET verification_code = NULL,
      verification_code_available = true,
      verification_code_expires_at = p_expires_at
  WHERE id = p_email_id
    AND user_id = p_user_id
    AND tracked_job_id = p_tracked_job_id
    AND gmail_connection_id = p_gmail_connection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mc_reserve_verification_code(
  p_task_id uuid,
  p_worker_id text,
  p_user_id uuid,
  p_tracked_job_id uuid
) RETURNS TABLE (
  reservation_id uuid,
  email_id uuid,
  code_ciphertext text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.applypass_tasks t
    WHERE t.id = p_task_id
      AND t.user_id = p_user_id
      AND t.status = 'running'
      AND t.locked_by = p_worker_id
      AND (
        t.payload->>'tracked_job_id' = p_tracked_job_id::text
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(coalesce(t.payload->'jobs', '[]'::jsonb)) job
          WHERE coalesce(job->>'trackedJobId', job->>'tracked_job_id') = p_tracked_job_id::text
        )
      )
  ) THEN
    RETURN;
  END IF;

  SELECT c.id INTO selected_id
  FROM app_private.mc_verification_codes c
  WHERE c.user_id = p_user_id
    AND c.tracked_job_id = p_tracked_job_id
    AND c.used_at IS NULL
    AND c.expires_at > now()
    AND (
      c.reserved_task_id IS NULL
      OR (c.reserved_task_id = p_task_id AND c.reserved_worker_id = p_worker_id)
      OR (
        c.reserved_at < now() - interval '2 minutes'
        AND NOT EXISTS (
          SELECT 1
          FROM public.applypass_tasks active_task
          WHERE active_task.id = c.reserved_task_id
            AND active_task.status = 'running'
            AND active_task.locked_by = c.reserved_worker_id
            AND active_task.heartbeat_at > now() - interval '90 seconds'
        )
      )
    )
  ORDER BY c.created_at DESC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF selected_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE app_private.mc_verification_codes c
  SET reserved_task_id = p_task_id,
      reserved_worker_id = p_worker_id,
      reserved_at = now()
  WHERE c.id = selected_id;

  RETURN QUERY
  SELECT c.id, c.email_id, c.code_ciphertext, c.expires_at
  FROM app_private.mc_verification_codes c
  WHERE c.id = selected_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mc_ack_verification_code(
  p_reservation_id uuid,
  p_task_id uuid,
  p_worker_id text,
  p_accepted boolean
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_email_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT c.email_id INTO target_email_id
  FROM app_private.mc_verification_codes c
  JOIN public.applypass_tasks t ON t.id = p_task_id
  WHERE c.id = p_reservation_id
    AND c.reserved_task_id = p_task_id
    AND c.reserved_worker_id = p_worker_id
    AND c.used_at IS NULL
    AND t.status = 'running'
    AND t.locked_by = p_worker_id
  FOR UPDATE OF c;

  IF target_email_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_accepted THEN
    UPDATE app_private.mc_verification_codes
    SET used_at = now(),
        code_ciphertext = '',
        reserved_at = now()
    WHERE id = p_reservation_id;

    UPDATE public.mc_inbound_emails
    SET verification_code = NULL,
        verification_code_available = false,
        verification_code_expires_at = NULL,
        verification_code_used_at = now(),
        is_read = true
    WHERE id = target_email_id;
  ELSE
    UPDATE app_private.mc_verification_codes
    SET reserved_task_id = NULL,
        reserved_worker_id = NULL,
        reserved_at = NULL
    WHERE id = p_reservation_id;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.mc_expire_verification_codes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  expired_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  WITH expired AS (
    DELETE FROM app_private.mc_verification_codes
    WHERE expires_at <= now()
    RETURNING email_id
  )
  UPDATE public.mc_inbound_emails e
  SET verification_code = NULL,
      verification_code_available = false,
      verification_code_expires_at = NULL
  WHERE e.id IN (SELECT email_id FROM expired);

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mc_store_verification_code(uuid, uuid, uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mc_reserve_verification_code(uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mc_ack_verification_code(uuid, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mc_expire_verification_codes()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mc_store_verification_code(uuid, uuid, uuid, uuid, text, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mc_reserve_verification_code(uuid, text, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mc_ack_verification_code(uuid, uuid, text, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mc_expire_verification_codes()
  TO service_role;

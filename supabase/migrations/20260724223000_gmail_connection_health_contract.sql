-- Canonical Gmail connection health contract.
--
-- This migration intentionally follows the OAuth/polling migrations so the
-- same health columns exist in every environment before the health-aware
-- Edge Function and UI are promoted.

ALTER TABLE public.mc_gmail_connections
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'connected',
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;

ALTER TABLE public.mc_gmail_connections
  DROP CONSTRAINT IF EXISTS mc_gmail_connections_status_check,
  DROP CONSTRAINT IF EXISTS mc_gmail_connections_failures_check,
  DROP CONSTRAINT IF EXISTS mc_gmail_connections_health_consistency_check;

-- Normalize older environment-specific values to the public, user-safe
-- contract before adding constraints. This is idempotent on an already
-- normalized database.
UPDATE public.mc_gmail_connections
SET
  status = CASE
    WHEN status IN ('connected', 'degraded', 'disconnected') THEN status
    WHEN enabled THEN 'connected'
    ELSE 'disconnected'
  END,
  consecutive_failures = GREATEST(0, COALESCE(consecutive_failures, 0));

UPDATE public.mc_gmail_connections
SET
  status_reason = CASE
    WHEN status = 'connected' THEN NULL
    WHEN status = 'disconnected'
      THEN 'Reconnect Google to resume application inbox checks.'
    WHEN last_error_code = 'INBOX_RATE_LIMITED'
      THEN 'Google asked us to pause briefly. Inbox checks will retry automatically.'
    ELSE 'Application inbox checks are temporarily delayed and will retry automatically.'
  END,
  last_error_code = CASE
    WHEN status = 'connected' THEN NULL
    WHEN status = 'disconnected' THEN 'INBOX_RECONNECT_REQUIRED'
    WHEN last_error_code = 'INBOX_RATE_LIMITED' THEN 'INBOX_RATE_LIMITED'
    ELSE 'INBOX_CHECK_FAILED'
  END,
  last_error_at = CASE
    WHEN status = 'connected' THEN NULL
    ELSE COALESCE(last_error_at, updated_at, now())
  END,
  consecutive_failures = CASE
    WHEN status = 'connected' THEN 0
    ELSE GREATEST(1, consecutive_failures)
  END;

ALTER TABLE public.mc_gmail_connections
  ALTER COLUMN status SET DEFAULT 'connected',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN consecutive_failures SET DEFAULT 0,
  ALTER COLUMN consecutive_failures SET NOT NULL;

ALTER TABLE public.mc_gmail_connections
  ADD CONSTRAINT mc_gmail_connections_status_check
    CHECK (status IN ('connected', 'degraded', 'disconnected')),
  ADD CONSTRAINT mc_gmail_connections_failures_check
    CHECK (consecutive_failures >= 0),
  ADD CONSTRAINT mc_gmail_connections_health_consistency_check
    CHECK (
      (
        status = 'connected'
        AND consecutive_failures = 0
        AND status_reason IS NULL
        AND last_error_code IS NULL
        AND last_error_at IS NULL
      )
      OR
      (
        status IN ('degraded', 'disconnected')
        AND consecutive_failures >= 1
        AND status_reason IS NOT NULL
        AND char_length(status_reason) <= 240
        AND last_error_code IN (
          'INBOX_RECONNECT_REQUIRED',
          'INBOX_RATE_LIMITED',
          'INBOX_CHECK_FAILED'
        )
        AND last_error_at IS NOT NULL
      )
    );

COMMENT ON COLUMN public.mc_gmail_connections.status IS
  'User-safe inbox health: connected, degraded, or disconnected.';
COMMENT ON COLUMN public.mc_gmail_connections.status_reason IS
  'User-safe health guidance; never stores raw provider or infrastructure errors.';
COMMENT ON COLUMN public.mc_gmail_connections.last_error_code IS
  'Stable public error category; never stores raw provider responses.';

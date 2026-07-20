-- OTP inbox wiring: employer verification codes land in mc_inbound_emails
-- (secure application inbox), are consumed single-use by the trusted worker,
-- and expire after 10 minutes. Codes are never written to logs.
--
-- Columns originally ship in 20260718160000_secure_application_inbox.sql and
-- 20260718190000_agent_verification_bridge.sql; repeated here defensively so
-- this file is self-sufficient on databases that drifted. Idempotent.

ALTER TABLE public.mc_inbound_emails
  ADD COLUMN IF NOT EXISTS verification_code text,
  ADD COLUMN IF NOT EXISTS verification_code_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_code_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

-- Active-code lookup used by the queue's verification-code action.
CREATE INDEX IF NOT EXISTS mc_emails_active_code_idx
  ON public.mc_inbound_emails (user_id, tracked_job_id, received_at DESC)
  WHERE verification_code IS NOT NULL;

-- Expiry sweep in mc-gmail-poll clears lapsed codes every run.
CREATE INDEX IF NOT EXISTS mc_emails_code_sweep_idx
  ON public.mc_inbound_emails (verification_code_expires_at)
  WHERE verification_code IS NOT NULL;

-- RLS: owner policy already exists (mc_emails_owner_all, 20260427120000).
-- Codes stay readable only by the owning user and the service role.

-- ── pg_cron: poll Gmail every 5 minutes ───────────────────────────────────
-- Mirrors the existing pg_cron → net.http_post pattern. The service-role
-- bearer is the worker secret: mc-gmail-poll treats it as a trusted caller
-- and polls every enabled connection. Requires app.settings.mc_gmail_poll_url
-- and app.settings.service_role_key (same as the other cron jobs).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('mc-gmail-poll-5min')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mc-gmail-poll-5min');
    PERFORM cron.schedule(
      'mc-gmail-poll-5min',
      '*/5 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.mc_gmail_poll_url', true),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object('source', 'pg_cron')
      );
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron or pg_net not configured (local dev) — skip silently
  NULL;
END $$;

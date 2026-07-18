-- One-time application codes are consumed by the trusted browser worker and
-- immediately removed. The used timestamp supports a non-secret audit trail.
ALTER TABLE public.mc_inbound_emails
  ADD COLUMN IF NOT EXISTS verification_code_used_at timestamptz;

CREATE INDEX IF NOT EXISTS mc_emails_active_code_idx
  ON public.mc_inbound_emails (user_id, tracked_job_id, received_at DESC)
  WHERE verification_code IS NOT NULL;

COMMENT ON COLUMN public.mc_inbound_emails.verification_code_used_at IS
  'Timestamp when the trusted application worker consumed the short-lived code; the code itself is cleared.';

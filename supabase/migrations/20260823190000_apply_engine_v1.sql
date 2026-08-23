-- Apply engine v1: independent cloud jobs, ATS detection metadata, receipts,
-- and an explicit hands-off cadence. Detection of an ATS is stored separately
-- from whether a live adapter can submit.

ALTER TABLE public.draft_applications
  ADD COLUMN IF NOT EXISTS detected_ats TEXT,
  ADD COLUMN IF NOT EXISTS ats_submittable BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.draft_applications.detected_ats IS
  'ATS slug detected from the job URL. Detection is not a submit capability.';
COMMENT ON COLUMN public.draft_applications.ats_submittable IS
  'True only when a live adapter may attempt a receipt-backed submit.';

ALTER TABLE public.user_job_prefs
  ADD COLUMN IF NOT EXISTS hands_off_cadence TEXT NOT NULL DEFAULT 'hourly'
    CHECK (hands_off_cadence IN ('off', 'hourly', 'daily'));

COMMENT ON COLUMN public.user_job_prefs.hands_off_cadence IS
  'Scheduler cadence for hands-off apply. Kill switch is auto_apply_enabled=false.';

CREATE TABLE IF NOT EXISTS public.application_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_application_id UUID REFERENCES public.draft_applications(id) ON DELETE SET NULL,
  applypass_task_id UUID REFERENCES public.applypass_tasks(id) ON DELETE SET NULL,
  ats TEXT,
  submitted BOOLEAN NOT NULL DEFAULT false,
  fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_application_receipts_user_created
  ON public.application_receipts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_application_receipts_draft
  ON public.application_receipts (draft_application_id);

ALTER TABLE public.application_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own application receipts" ON public.application_receipts;
CREATE POLICY "Users read own application receipts"
  ON public.application_receipts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own application receipts" ON public.application_receipts;
CREATE POLICY "Users insert own application receipts"
  ON public.application_receipts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.application_receipts IS
  'Per-application evidence of what was filled and whether the ATS confirmed submit.';

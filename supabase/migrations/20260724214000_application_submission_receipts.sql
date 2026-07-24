-- Immutable evidence for applications the worker can truthfully call
-- submitted. Task payload/result JSON remains operational state; this table is
-- the auditable record shown to the applicant and used for inbox correlation.

CREATE TABLE public.application_submission_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid,
  tracked_job_id uuid,
  draft_application_id uuid,
  job_id text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('greenhouse', 'lever', 'ashby', 'workable')),
  apply_url text NOT NULL,
  worker_id text NOT NULL,
  submitted_at timestamptz NOT NULL,
  evidence jsonb NOT NULL,
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, job_id)
);

ALTER TABLE public.application_submission_receipts
  ADD CONSTRAINT application_receipts_task_owner_fkey
  FOREIGN KEY (task_id, user_id)
  REFERENCES public.applypass_tasks (id, user_id)
  ON DELETE SET NULL (task_id),
  ADD CONSTRAINT application_receipts_job_owner_fkey
  FOREIGN KEY (tracked_job_id, user_id)
  REFERENCES public.mc_tracked_jobs (id, user_id)
  ON DELETE SET NULL (tracked_job_id),
  ADD CONSTRAINT application_receipts_draft_owner_fkey
  FOREIGN KEY (draft_application_id, user_id)
  REFERENCES public.draft_applications (id, user_id)
  ON DELETE SET NULL (draft_application_id);

CREATE INDEX application_receipts_user_submitted_idx
  ON public.application_submission_receipts (user_id, submitted_at DESC);
CREATE INDEX application_receipts_tracked_job_idx
  ON public.application_submission_receipts (tracked_job_id)
  WHERE tracked_job_id IS NOT NULL;

ALTER TABLE public.application_submission_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own application receipts"
  ON public.application_submission_receipts
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.application_submission_receipts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.application_submission_receipts TO authenticated;
REVOKE ALL ON public.application_submission_receipts FROM service_role;
GRANT SELECT ON public.application_submission_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_application_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Account-erasure cascades run after the auth.users row is removed. Direct
    -- service deletes while an owner still exists remain forbidden.
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'application submission receipts are immutable';
  END IF;

  -- Referential cleanup may null a deleted operational task/draft/job while
  -- preserving every piece of submission evidence.
  IF (to_jsonb(NEW) - ARRAY['task_id', 'tracked_job_id', 'draft_application_id'])
       = (to_jsonb(OLD) - ARRAY['task_id', 'tracked_job_id', 'draft_application_id'])
    AND (NEW.task_id IS NOT DISTINCT FROM OLD.task_id OR NEW.task_id IS NULL)
    AND (NEW.tracked_job_id IS NOT DISTINCT FROM OLD.tracked_job_id OR NEW.tracked_job_id IS NULL)
    AND (NEW.draft_application_id IS NOT DISTINCT FROM OLD.draft_application_id OR NEW.draft_application_id IS NULL)
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'application submission receipts are immutable';
END;
$$;

CREATE TRIGGER application_receipts_immutable
  BEFORE UPDATE OR DELETE ON public.application_submission_receipts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_application_receipt_mutation();

REVOKE ALL ON FUNCTION public.prevent_application_receipt_mutation()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_application_receipt_mutation()
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_application_submission_receipt(
  p_task_id uuid,
  p_worker_id text,
  p_tracked_job_id uuid,
  p_draft_application_id uuid,
  p_job_id text,
  p_provider text,
  p_apply_url text,
  p_evidence jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  task_owner uuid;
  task_payload jsonb;
  expected_job jsonb;
  expected_tracked_job_id uuid;
  expected_draft_id uuid;
  stored_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_provider NOT IN ('greenhouse', 'lever', 'ashby', 'workable')
    OR NULLIF(BTRIM(p_job_id), '') IS NULL
    OR NULLIF(BTRIM(p_apply_url), '') IS NULL
    OR jsonb_typeof(p_evidence) <> 'object'
  THEN
    RAISE EXCEPTION 'invalid submission receipt';
  END IF;

  SELECT t.user_id, t.payload
  INTO task_owner, task_payload
  FROM public.applypass_tasks t
  WHERE t.id = p_task_id
    AND t.status = 'running'
    AND t.locked_by = p_worker_id
  FOR UPDATE;

  IF task_owner IS NULL THEN
    RAISE EXCEPTION 'submission task lease is not active';
  END IF;

  SELECT job
  INTO expected_job
  FROM jsonb_array_elements(COALESCE(task_payload -> 'jobs', '[]'::jsonb)) job
  WHERE job ->> 'id' = p_job_id
  LIMIT 1;

  IF expected_job IS NULL
    OR expected_job ->> 'url' IS DISTINCT FROM p_apply_url
    OR LOWER(COALESCE(expected_job ->> 'portal', task_payload ->> 'portal', ''))
      IS DISTINCT FROM p_provider
  THEN
    RAISE EXCEPTION 'submission receipt does not match the leased task';
  END IF;

  expected_tracked_job_id := NULLIF(
    COALESCE(
      expected_job ->> 'trackedJobId',
      expected_job ->> 'tracked_job_id',
      task_payload ->> 'tracked_job_id'
    ),
    ''
  )::uuid;
  expected_draft_id := NULLIF(task_payload ->> 'draft_application_id', '')::uuid;

  IF p_tracked_job_id IS DISTINCT FROM expected_tracked_job_id
    OR p_draft_application_id IS DISTINCT FROM expected_draft_id
  THEN
    RAISE EXCEPTION 'submission receipt relationship is invalid';
  END IF;

  INSERT INTO public.application_submission_receipts (
    user_id,
    task_id,
    tracked_job_id,
    draft_application_id,
    job_id,
    provider,
    apply_url,
    worker_id,
    submitted_at,
    evidence,
    evidence_sha256
  ) VALUES (
    task_owner,
    p_task_id,
    p_tracked_job_id,
    p_draft_application_id,
    p_job_id,
    p_provider,
    p_apply_url,
    p_worker_id,
    now(),
    p_evidence,
    encode(extensions.digest(p_evidence::text, 'sha256'), 'hex')
  )
  ON CONFLICT (task_id, job_id) DO NOTHING
  RETURNING id INTO stored_id;

  IF stored_id IS NULL THEN
    SELECT receipt.id
    INTO stored_id
    FROM public.application_submission_receipts receipt
    WHERE receipt.task_id = p_task_id
      AND receipt.job_id = p_job_id;
  END IF;

  RETURN stored_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_application_submission_receipt(
  uuid, text, uuid, uuid, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_application_submission_receipt(
  uuid, text, uuid, uuid, text, text, text, jsonb
) TO service_role;

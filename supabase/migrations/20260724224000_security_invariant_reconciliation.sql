-- Reconcile security invariants after the 2026072421xxxx migration group.
--
-- Those migrations have already run in DEV, so this migration is deliberately
-- additive/idempotent: it hardens the live definitions without rewriting
-- migration history. All ownership changes are validated before commit.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

-- Fail before changing constraints if an older environment contains
-- cross-tenant relationships. Plaintext verification codes are handled below
-- as an intentional secret-erasure operation.
DO $$
DECLARE
  invalid_count bigint;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM (
    SELECT r.id
    FROM public.resumes r
    LEFT JOIN auth.users u ON u.id = r.user_id
    WHERE u.id IS NULL

    UNION ALL
    SELECT r.id
    FROM public.resumes r
    LEFT JOIN public.user_documents d ON d.id = r.source_document_id
    WHERE r.source_document_id IS NOT NULL
      AND (d.id IS NULL OR d.user_id IS DISTINCT FROM r.user_id)

    UNION ALL
    SELECT p.id
    FROM public.profiles p
    LEFT JOIN public.resumes r ON r.id = p.primary_resume_id
    WHERE p.primary_resume_id IS NOT NULL
      AND (r.id IS NULL OR r.user_id IS DISTINCT FROM p.user_id)

    UNION ALL
    SELECT e.id
    FROM public.mc_inbound_emails e
    LEFT JOIN public.mc_gmail_connections c ON c.id = e.gmail_connection_id
    WHERE e.gmail_connection_id IS NOT NULL
      AND (
        c.id IS NULL
        OR c.user_id IS DISTINCT FROM e.user_id
        OR c.session_id IS DISTINCT FROM e.session_id
      )

    UNION ALL
    SELECT receipt.id
    FROM public.application_submission_receipts receipt
    LEFT JOIN public.applypass_tasks task ON task.id = receipt.task_id
    WHERE receipt.task_id IS NOT NULL
      AND (task.id IS NULL OR task.user_id IS DISTINCT FROM receipt.user_id)

    UNION ALL
    SELECT receipt.id
    FROM public.application_submission_receipts receipt
    LEFT JOIN public.mc_tracked_jobs job ON job.id = receipt.tracked_job_id
    WHERE receipt.tracked_job_id IS NOT NULL
      AND (job.id IS NULL OR job.user_id IS DISTINCT FROM receipt.user_id)

    UNION ALL
    SELECT receipt.id
    FROM public.application_submission_receipts receipt
    LEFT JOIN public.draft_applications draft
      ON draft.id = receipt.draft_application_id
    WHERE receipt.draft_application_id IS NOT NULL
      AND (draft.id IS NULL OR draft.user_id IS DISTINCT FROM receipt.user_id)

    UNION ALL
    SELECT code.id
    FROM app_private.mc_verification_codes code
    LEFT JOIN public.mc_tracked_jobs job ON job.id = code.tracked_job_id
    WHERE job.id IS NULL OR job.user_id IS DISTINCT FROM code.user_id

    UNION ALL
    SELECT code.id
    FROM app_private.mc_verification_codes code
    LEFT JOIN public.applypass_tasks task ON task.id = code.reserved_task_id
    WHERE code.reserved_task_id IS NOT NULL
      AND (task.id IS NULL OR task.user_id IS DISTINCT FROM code.user_id)
  ) violations;

  IF invalid_count <> 0 THEN
    RAISE EXCEPTION
      'Security reconciliation aborted: % ownership violation(s) require quarantine',
      invalid_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.application_submission_receipts receipt
    WHERE receipt.evidence_sha256 IS DISTINCT FROM
      encode(extensions.digest(receipt.evidence::text, 'sha256'), 'hex')
  ) THEN
    RAISE EXCEPTION
      'Security reconciliation aborted: a submission receipt digest requires audit';
  END IF;
END
$$;

-- Supporting keys/indexes for composite ownership checks and worker lookups.
CREATE UNIQUE INDEX IF NOT EXISTS resumes_id_user_unique
  ON public.resumes (id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_documents_id_user_unique
  ON public.user_documents (id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS applypass_tasks_id_user_unique
  ON public.applypass_tasks (id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS draft_applications_id_user_unique
  ON public.draft_applications (id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS mc_tracked_jobs_id_user_unique
  ON public.mc_tracked_jobs (id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS mc_gmail_connections_id_user_unique
  ON public.mc_gmail_connections (id, user_id);

CREATE INDEX IF NOT EXISTS resumes_source_document_owner_idx
  ON public.resumes (source_document_id, user_id)
  WHERE source_document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_primary_resume_owner_idx
  ON public.profiles (primary_resume_id, user_id)
  WHERE primary_resume_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mc_inbound_connection_owner_idx
  ON public.mc_inbound_emails (gmail_connection_id, user_id, session_id)
  WHERE gmail_connection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS application_receipts_task_owner_idx
  ON public.application_submission_receipts (task_id, user_id)
  WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS application_receipts_draft_owner_idx
  ON public.application_submission_receipts (draft_application_id, user_id)
  WHERE draft_application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mc_verification_codes_job_owner_idx
  ON app_private.mc_verification_codes (tracked_job_id, user_id);

-- Recreate the minimum ownership constraints as NOT VALID, then validate.
-- This is safe to run again and corrects an older definition with the same
-- constraint name.
ALTER TABLE public.resumes
  DROP CONSTRAINT IF EXISTS resumes_user_fkey,
  DROP CONSTRAINT IF EXISTS resumes_source_document_owner_fkey;
ALTER TABLE public.resumes
  ADD CONSTRAINT resumes_user_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id)
    ON DELETE CASCADE NOT VALID,
  ADD CONSTRAINT resumes_source_document_owner_fkey
    FOREIGN KEY (source_document_id, user_id)
    REFERENCES public.user_documents(id, user_id)
    ON DELETE SET NULL (source_document_id) NOT VALID;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_primary_resume_owner_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_primary_resume_owner_fkey
    FOREIGN KEY (primary_resume_id, user_id)
    REFERENCES public.resumes(id, user_id)
    ON DELETE SET NULL (primary_resume_id) NOT VALID;

ALTER TABLE public.mc_inbound_emails
  ALTER COLUMN gmail_connection_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS mc_inbound_emails_connection_owner_fkey;
ALTER TABLE public.mc_inbound_emails
  ADD CONSTRAINT mc_inbound_emails_connection_owner_fkey
    FOREIGN KEY (gmail_connection_id, user_id)
    REFERENCES public.mc_gmail_connections(id, user_id)
    ON DELETE SET NULL (gmail_connection_id) NOT VALID;

ALTER TABLE public.application_submission_receipts
  DROP CONSTRAINT IF EXISTS application_receipts_task_owner_fkey,
  DROP CONSTRAINT IF EXISTS application_receipts_job_owner_fkey,
  DROP CONSTRAINT IF EXISTS application_receipts_draft_owner_fkey;
ALTER TABLE public.application_submission_receipts
  ADD CONSTRAINT application_receipts_task_owner_fkey
    FOREIGN KEY (task_id, user_id)
    REFERENCES public.applypass_tasks(id, user_id)
    ON DELETE SET NULL (task_id) NOT VALID,
  ADD CONSTRAINT application_receipts_job_owner_fkey
    FOREIGN KEY (tracked_job_id, user_id)
    REFERENCES public.mc_tracked_jobs(id, user_id)
    ON DELETE SET NULL (tracked_job_id) NOT VALID,
  ADD CONSTRAINT application_receipts_draft_owner_fkey
    FOREIGN KEY (draft_application_id, user_id)
    REFERENCES public.draft_applications(id, user_id)
    ON DELETE SET NULL (draft_application_id) NOT VALID;

ALTER TABLE app_private.mc_verification_codes
  DROP CONSTRAINT IF EXISTS mc_verification_code_tracked_job_owner_fkey,
  DROP CONSTRAINT IF EXISTS mc_verification_codes_reserved_task_id_fkey,
  DROP CONSTRAINT IF EXISTS mc_verification_code_reserved_task_owner_fkey;
ALTER TABLE app_private.mc_verification_codes
  ADD CONSTRAINT mc_verification_code_tracked_job_owner_fkey
    FOREIGN KEY (tracked_job_id, user_id)
    REFERENCES public.mc_tracked_jobs(id, user_id)
    ON DELETE CASCADE NOT VALID,
  ADD CONSTRAINT mc_verification_code_reserved_task_owner_fkey
    FOREIGN KEY (reserved_task_id, user_id)
    REFERENCES public.applypass_tasks(id, user_id)
    ON DELETE SET NULL (reserved_task_id) NOT VALID;

ALTER TABLE public.resumes VALIDATE CONSTRAINT resumes_user_fkey;
ALTER TABLE public.resumes VALIDATE CONSTRAINT resumes_source_document_owner_fkey;
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_primary_resume_owner_fkey;
ALTER TABLE public.mc_inbound_emails
  VALIDATE CONSTRAINT mc_inbound_emails_connection_owner_fkey;
ALTER TABLE public.application_submission_receipts
  VALIDATE CONSTRAINT application_receipts_task_owner_fkey;
ALTER TABLE public.application_submission_receipts
  VALIDATE CONSTRAINT application_receipts_job_owner_fkey;
ALTER TABLE public.application_submission_receipts
  VALIDATE CONSTRAINT application_receipts_draft_owner_fkey;
ALTER TABLE app_private.mc_verification_codes
  VALIDATE CONSTRAINT mc_verification_code_tracked_job_owner_fkey;
ALTER TABLE app_private.mc_verification_codes
  VALIDATE CONSTRAINT mc_verification_code_reserved_task_owner_fkey;

-- Imported résumés fail closed as soon as any import provenance appears.
-- Scratch-built résumés intentionally have no import provenance and remain
-- usable. Only review_required imports can receive a user confirmation.
CREATE OR REPLACE FUNCTION public.resume_is_automation_ready(
  p_parse_quality jsonb,
  p_source_hash text,
  p_source_document_id uuid,
  p_parser_version text,
  p_parsed_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  quality jsonb := p_parse_quality;
  confirmation jsonb;
  warning_text text;
  truncated boolean := false;
  confirmed_at timestamptz;
  has_provenance boolean;
BEGIN
  has_provenance :=
    quality IS NOT NULL
    OR NULLIF(BTRIM(p_source_hash), '') IS NOT NULL
    OR p_source_document_id IS NOT NULL
    OR NULLIF(BTRIM(p_parser_version), '') IS NOT NULL
    OR p_parsed_at IS NOT NULL;

  IF NOT has_provenance THEN
    RETURN true;
  END IF;
  IF jsonb_typeof(quality) <> 'object'
    OR BTRIM(COALESCE(p_source_hash, '')) !~ '^[a-f0-9]{64}$'
    OR p_source_document_id IS NULL
    OR NULLIF(BTRIM(p_parser_version), '') IS NULL
    OR p_parsed_at IS NULL
    OR p_parsed_at > now() + interval '5 minutes'
    OR COALESCE(quality ->> 'status', '') NOT IN ('passed', 'review_required')
  THEN
    RETURN false;
  END IF;

  truncated := COALESCE(quality ->> 'truncated' = 'true', false);
  IF jsonb_typeof(quality -> 'warnings') = 'array' THEN
    FOR warning_text IN SELECT jsonb_array_elements_text(quality -> 'warnings')
    LOOP
      IF warning_text ~* '(truncat|parser limit|source exceeded)' THEN
        truncated := true;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF quality ->> 'status' = 'passed' AND NOT truncated THEN
    RETURN true;
  END IF;

  confirmation := quality -> 'review_confirmation';
  IF jsonb_typeof(confirmation) <> 'object'
    OR confirmation ->> 'method' <> 'user_review'
    OR confirmation ->> 'version' <> '1'
    OR COALESCE(confirmation ->> 'source_hash', '') <> BTRIM(p_source_hash)
  THEN
    RETURN false;
  END IF;
  BEGIN
    confirmed_at := (confirmation ->> 'confirmed_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  RETURN confirmed_at IS NOT NULL
    AND confirmed_at >= p_parsed_at
    AND confirmed_at <= now() + interval '5 minutes';
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_resume_import_review(p_resume_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  candidate public.resumes%ROWTYPE;
  warning_text text;
  needs_review boolean := false;
  confirmed_quality jsonb;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO candidate
  FROM public.resumes
  WHERE id = p_resume_id AND user_id = caller_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'resume not found';
  END IF;
  IF jsonb_typeof(candidate.parse_quality) <> 'object'
    OR BTRIM(COALESCE(candidate.source_hash, '')) !~ '^[a-f0-9]{64}$'
    OR candidate.source_document_id IS NULL
    OR NULLIF(BTRIM(candidate.parser_version), '') IS NULL
    OR candidate.parsed_at IS NULL
    OR candidate.parsed_at > now() + interval '5 minutes'
  THEN
    RAISE EXCEPTION 'resume import provenance is incomplete';
  END IF;

  needs_review := candidate.parse_quality ->> 'status' = 'review_required'
    OR COALESCE(candidate.parse_quality ->> 'truncated' = 'true', false);
  IF jsonb_typeof(candidate.parse_quality -> 'warnings') = 'array' THEN
    FOR warning_text IN
      SELECT jsonb_array_elements_text(candidate.parse_quality -> 'warnings')
    LOOP
      IF warning_text ~* '(truncat|parser limit|source exceeded)' THEN
        needs_review := true;
        EXIT;
      END IF;
    END LOOP;
  END IF;
  IF NOT needs_review
    OR COALESCE(candidate.parse_quality ->> 'status', '')
      NOT IN ('passed', 'review_required')
  THEN
    RAISE EXCEPTION 'this resume import is not eligible for review confirmation';
  END IF;

  confirmed_quality := jsonb_set(
    candidate.parse_quality,
    '{review_confirmation}',
    jsonb_build_object(
      'confirmed_at', now(),
      'source_hash', BTRIM(candidate.source_hash),
      'method', 'user_review',
      'version', 1
    ),
    true
  );
  UPDATE public.resumes
  SET parse_quality = confirmed_quality
  WHERE id = candidate.id AND user_id = caller_id;
  RETURN confirmed_quality;
END;
$$;

REVOKE ALL ON FUNCTION public.resume_is_automation_ready(
  jsonb, text, uuid, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.confirm_resume_import_review(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_resume_import_review(uuid)
  TO authenticated;

-- Remove dangerous default TRUNCATE/TRIGGER grants while preserving editor
-- columns. Provenance is immutable after insert except through trusted code.
REVOKE ALL ON public.resumes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.resumes TO authenticated;
GRANT UPDATE (
  title, personal_info, summary, experience, education, skills, projects,
  certifications, languages, template, section_order, volunteer, awards,
  custom_sections
) ON public.resumes TO authenticated;
GRANT ALL ON public.resumes TO service_role;
REVOKE ALL ON public.profiles FROM PUBLIC, anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.profiles FROM authenticated;

-- A digest is now derived and verified by PostgreSQL, not trusted from a
-- worker argument.
CREATE OR REPLACE FUNCTION public.set_application_receipt_digest()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF jsonb_typeof(NEW.evidence) <> 'object' THEN
    RAISE EXCEPTION 'submission evidence must be an object';
  END IF;
  NEW.evidence_sha256 :=
    encode(extensions.digest(NEW.evidence::text, 'sha256'), 'hex');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS application_receipts_set_digest
  ON public.application_submission_receipts;
CREATE TRIGGER application_receipts_set_digest
  BEFORE INSERT ON public.application_submission_receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_application_receipt_digest();

ALTER TABLE public.application_submission_receipts
  DROP CONSTRAINT IF EXISTS application_receipts_evidence_object_check,
  DROP CONSTRAINT IF EXISTS application_receipts_evidence_digest_check;
ALTER TABLE public.application_submission_receipts
  ADD CONSTRAINT application_receipts_evidence_object_check
    CHECK (jsonb_typeof(evidence) = 'object') NOT VALID,
  ADD CONSTRAINT application_receipts_evidence_digest_check
    CHECK (
      evidence_sha256 =
        encode(extensions.digest(evidence::text, 'sha256'), 'hex')
    ) NOT VALID;
ALTER TABLE public.application_submission_receipts
  VALIDATE CONSTRAINT application_receipts_evidence_object_check;
ALTER TABLE public.application_submission_receipts
  VALIDATE CONSTRAINT application_receipts_evidence_digest_check;

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
  tracked_text text;
  draft_text text;
  expected_tracked_job_id uuid;
  expected_draft_id uuid;
  signal_text text;
  receipt_application_id text;
  transport_status_text text;
  transport_signal_text text;
  transport_application_id text;
  has_receipt_proof boolean := false;
  has_transport_proof boolean := false;
  stored_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_provider NOT IN ('greenhouse', 'lever', 'ashby', 'workable')
    OR NULLIF(BTRIM(p_worker_id), '') IS NULL
    OR NULLIF(BTRIM(p_job_id), '') IS NULL
    OR NULLIF(BTRIM(p_apply_url), '') IS NULL
    OR p_apply_url !~ '^https://'
    OR jsonb_typeof(p_evidence) <> 'object'
  THEN
    RAISE EXCEPTION 'invalid submission receipt';
  END IF;

  signal_text := p_evidence #>> '{receipt,signal}';
  receipt_application_id := p_evidence #>> '{receipt,applicationId}';
  transport_status_text := p_evidence ->> 'submission_response_status';
  transport_signal_text := p_evidence ->> 'transport_signal';
  transport_application_id :=
    p_evidence ->> 'transport_application_id';
  has_receipt_proof :=
    COALESCE(receipt_application_id, '')
      ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{3,127}$'
    OR CASE p_provider
      WHEN 'greenhouse' THEN signal_text =
        'greenhouse-confirmation-container'
      WHEN 'lever' THEN signal_text IN (
        'lever-thanks-url',
        'lever-confirmation-container'
      )
      WHEN 'ashby' THEN signal_text IN (
        'ashby-submitted-url',
        'ashby-confirmation-container'
      )
      WHEN 'workable' THEN signal_text =
        'workable-confirmation-container'
      ELSE false
    END;
  has_transport_proof := CASE
    WHEN p_evidence -> 'submission_request_matched' = 'true'::jsonb
      AND p_evidence -> 'transport_confirmed' = 'true'::jsonb
      AND CASE
        WHEN COALESCE(transport_status_text, '') ~ '^[0-9]{3}$'
          THEN transport_status_text::integer BETWEEN 200 AND 299
        ELSE false
      END
      AND transport_signal_text IN (
        'ats-submission-application-id',
        'ats-submission-explicit-success'
      )
      AND (
        transport_signal_text <> 'ats-submission-application-id'
        OR COALESCE(transport_application_id, '')
          ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{3,127}$'
      )
    THEN true
    ELSE false
  END;
  IF NOT COALESCE(has_receipt_proof, false)
    AND NOT COALESCE(has_transport_proof, false)
  THEN
    RAISE EXCEPTION 'submission evidence is not confirmation-grade';
  END IF;

  SELECT task.user_id, task.payload
  INTO task_owner, task_payload
  FROM public.applypass_tasks task
  WHERE task.id = p_task_id
    AND task.status = 'running'
    AND task.locked_by = p_worker_id
    AND COALESCE(
      task.heartbeat_at, task.locked_at, task.started_at, task.created_at
    ) > now() - interval '15 minutes'
  FOR UPDATE;
  IF task_owner IS NULL THEN
    RAISE EXCEPTION 'submission task lease is not active';
  END IF;

  SELECT job INTO expected_job
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(task_payload -> 'jobs') = 'array'
        THEN task_payload -> 'jobs'
      ELSE '[]'::jsonb
    END
  ) job
  WHERE job ->> 'id' = p_job_id
  LIMIT 1;
  IF expected_job IS NULL
    OR expected_job ->> 'url' IS DISTINCT FROM p_apply_url
    OR LOWER(COALESCE(
      expected_job ->> 'portal', task_payload ->> 'portal', ''
    )) IS DISTINCT FROM p_provider
  THEN
    RAISE EXCEPTION 'submission receipt does not match the leased task';
  END IF;

  tracked_text := NULLIF(COALESCE(
    expected_job ->> 'trackedJobId',
    expected_job ->> 'tracked_job_id',
    task_payload ->> 'tracked_job_id'
  ), '');
  draft_text := NULLIF(task_payload ->> 'draft_application_id', '');
  IF tracked_text IS NOT NULL
    AND tracked_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'leased tracked-job identifier is invalid';
  END IF;
  IF draft_text IS NOT NULL
    AND draft_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'leased draft identifier is invalid';
  END IF;
  expected_tracked_job_id := tracked_text::uuid;
  expected_draft_id := draft_text::uuid;
  IF p_tracked_job_id IS DISTINCT FROM expected_tracked_job_id
    OR p_draft_application_id IS DISTINCT FROM expected_draft_id
  THEN
    RAISE EXCEPTION 'submission receipt relationship is invalid';
  END IF;

  INSERT INTO public.application_submission_receipts (
    user_id, task_id, tracked_job_id, draft_application_id, job_id, provider,
    apply_url, worker_id, submitted_at, evidence, evidence_sha256
  ) VALUES (
    task_owner, p_task_id, p_tracked_job_id, p_draft_application_id, p_job_id,
    p_provider, p_apply_url, p_worker_id, now(), p_evidence,
    encode(extensions.digest(p_evidence::text, 'sha256'), 'hex')
  )
  ON CONFLICT (task_id, job_id) DO NOTHING
  RETURNING id INTO stored_id;

  IF stored_id IS NULL THEN
    SELECT receipt.id INTO stored_id
    FROM public.application_submission_receipts receipt
    WHERE receipt.task_id = p_task_id AND receipt.job_id = p_job_id;
  END IF;
  RETURN stored_id;
END;
$$;

REVOKE ALL ON public.application_submission_receipts
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.application_submission_receipts TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_application_receipt_digest()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_application_receipt_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_application_submission_receipt(
  uuid, text, uuid, uuid, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_application_submission_receipt(
  uuid, text, uuid, uuid, text, text, text, jsonb
) TO service_role;

-- A legacy browser policy allowed a user to label a prepared draft submitted
-- without worker evidence. Submission truth is receipt-backed only.
DROP POLICY IF EXISTS "Users acknowledge manual draft submission"
  ON public.draft_applications;
REVOKE UPDATE (status, submitted_at) ON public.draft_applications
  FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE ON public.draft_applications FROM PUBLIC, anon, authenticated;

-- Plaintext OTPs cannot reappear. Lease metadata is normalized so task
-- deletion can safely clear a composite reservation FK.
UPDATE public.mc_inbound_emails
SET verification_code = NULL,
    verification_code_available = false,
    verification_code_expires_at = NULL
WHERE verification_code IS NOT NULL;
ALTER TABLE public.mc_inbound_emails
  DROP CONSTRAINT IF EXISTS mc_inbound_emails_verification_code_private_check;
ALTER TABLE public.mc_inbound_emails
  ADD CONSTRAINT mc_inbound_emails_verification_code_private_check
    CHECK (verification_code IS NULL) NOT VALID;
ALTER TABLE public.mc_inbound_emails
  VALIDATE CONSTRAINT mc_inbound_emails_verification_code_private_check;

CREATE OR REPLACE FUNCTION public.normalize_verification_code_lease()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.reserved_task_id IS NULL THEN
    NEW.reserved_worker_id := NULL;
    NEW.reserved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS mc_verification_codes_normalize_lease
  ON app_private.mc_verification_codes;
CREATE TRIGGER mc_verification_codes_normalize_lease
  BEFORE INSERT OR UPDATE ON app_private.mc_verification_codes
  FOR EACH ROW EXECUTE FUNCTION public.normalize_verification_code_lease();

ALTER TABLE app_private.mc_verification_codes
  DROP CONSTRAINT IF EXISTS mc_verification_code_lease_shape_check,
  DROP CONSTRAINT IF EXISTS mc_verification_code_ciphertext_lifecycle_check;
ALTER TABLE app_private.mc_verification_codes
  ADD CONSTRAINT mc_verification_code_lease_shape_check
    CHECK (
      (reserved_task_id IS NULL AND reserved_worker_id IS NULL AND reserved_at IS NULL)
      OR
      (reserved_task_id IS NOT NULL AND NULLIF(BTRIM(reserved_worker_id), '') IS NOT NULL
       AND reserved_at IS NOT NULL)
    ) NOT VALID,
  ADD CONSTRAINT mc_verification_code_ciphertext_lifecycle_check
    CHECK (
      (used_at IS NULL AND NULLIF(code_ciphertext, '') IS NOT NULL)
      OR (used_at IS NOT NULL AND code_ciphertext = '')
    ) NOT VALID;
ALTER TABLE app_private.mc_verification_codes
  VALIDATE CONSTRAINT mc_verification_code_lease_shape_check;
ALTER TABLE app_private.mc_verification_codes
  VALIDATE CONSTRAINT mc_verification_code_ciphertext_lifecycle_check;

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
DECLARE
  existing_code app_private.mc_verification_codes%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_expires_at <= now()
    OR p_expires_at > now() + interval '1 day'
    OR NULLIF(p_code_ciphertext, '') IS NULL
  THEN
    RAISE EXCEPTION 'invalid verification code lease';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.mc_inbound_emails email
    WHERE email.id = p_email_id
      AND email.user_id = p_user_id
      AND email.tracked_job_id = p_tracked_job_id
      AND email.gmail_connection_id = p_gmail_connection_id
  ) THEN
    RAISE EXCEPTION 'verification email relationship is invalid';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_email_id::text, 7242026)
  );
  SELECT * INTO existing_code
  FROM app_private.mc_verification_codes
  WHERE email_id = p_email_id
  FOR UPDATE;

  IF FOUND THEN
    IF existing_code.used_at IS NOT NULL THEN
      RAISE EXCEPTION 'verification code was already consumed';
    END IF;
    IF existing_code.reserved_task_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.applypass_tasks task
      WHERE task.id = existing_code.reserved_task_id
        AND task.user_id = existing_code.user_id
        AND task.status = 'running'
        AND task.locked_by = existing_code.reserved_worker_id
        AND task.heartbeat_at > now() - interval '90 seconds'
    ) THEN
      RAISE EXCEPTION 'verification code is actively leased';
    END IF;
    UPDATE app_private.mc_verification_codes
    SET code_ciphertext = p_code_ciphertext,
        expires_at = p_expires_at,
        reserved_task_id = NULL,
        reserved_worker_id = NULL,
        reserved_at = NULL
    WHERE id = existing_code.id;
  ELSE
    INSERT INTO app_private.mc_verification_codes (
      email_id, user_id, tracked_job_id, gmail_connection_id,
      code_ciphertext, expires_at
    ) VALUES (
      p_email_id, p_user_id, p_tracked_job_id, p_gmail_connection_id,
      p_code_ciphertext, p_expires_at
    );
  END IF;

  UPDATE public.mc_inbound_emails
  SET verification_code = NULL,
      verification_code_available = true,
      verification_code_expires_at = p_expires_at,
      verification_code_used_at = NULL
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
  IF NULLIF(BTRIM(p_worker_id), '') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.applypass_tasks task
    WHERE task.id = p_task_id
      AND task.user_id = p_user_id
      AND task.status = 'running'
      AND task.locked_by = p_worker_id
      AND (
        task.payload ->> 'tracked_job_id' = p_tracked_job_id::text
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(task.payload -> 'jobs') = 'array'
                THEN task.payload -> 'jobs'
              ELSE '[]'::jsonb
            END
          ) job
          WHERE COALESCE(
            job ->> 'trackedJobId', job ->> 'tracked_job_id'
          ) = p_tracked_job_id::text
        )
      )
  ) THEN
    RETURN;
  END IF;

  SELECT code.id INTO selected_id
  FROM app_private.mc_verification_codes code
  WHERE code.user_id = p_user_id
    AND code.tracked_job_id = p_tracked_job_id
    AND code.used_at IS NULL
    AND code.expires_at > now()
    AND (
      code.reserved_task_id IS NULL
      OR (
        code.reserved_task_id = p_task_id
        AND code.reserved_worker_id = p_worker_id
      )
      OR (
        code.reserved_at < now() - interval '2 minutes'
        AND NOT EXISTS (
          SELECT 1 FROM public.applypass_tasks active_task
          WHERE active_task.id = code.reserved_task_id
            AND active_task.user_id = code.user_id
            AND active_task.status = 'running'
            AND active_task.locked_by = code.reserved_worker_id
            AND active_task.heartbeat_at > now() - interval '90 seconds'
        )
      )
    )
  ORDER BY code.created_at DESC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  IF selected_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE app_private.mc_verification_codes code
  SET reserved_task_id = p_task_id,
      reserved_worker_id = p_worker_id,
      reserved_at = now()
  WHERE code.id = selected_id;
  RETURN QUERY
  SELECT code.id, code.email_id, code.code_ciphertext, code.expires_at
  FROM app_private.mc_verification_codes code
  WHERE code.id = selected_id;
END;
$$;

REVOKE ALL ON app_private.mc_verification_codes
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.normalize_verification_code_lease()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mc_store_verification_code(
  uuid, uuid, uuid, uuid, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mc_reserve_verification_code(
  uuid, text, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mc_store_verification_code(
  uuid, uuid, uuid, uuid, text, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.mc_reserve_verification_code(
  uuid, text, uuid, uuid
) TO service_role;

-- Browser status transitions can only happen through the owner-checked atomic
-- RPC. Initial client-created cards are restricted to discovered/saved.
DROP POLICY IF EXISTS "mc_tracked_owner_all" ON public.mc_tracked_jobs;
DROP POLICY IF EXISTS "mc_tracked_owner_select" ON public.mc_tracked_jobs;
DROP POLICY IF EXISTS "mc_tracked_owner_insert" ON public.mc_tracked_jobs;
DROP POLICY IF EXISTS "mc_tracked_owner_update" ON public.mc_tracked_jobs;
DROP POLICY IF EXISTS "mc_tracked_owner_delete" ON public.mc_tracked_jobs;
CREATE POLICY "mc_tracked_owner_select"
  ON public.mc_tracked_jobs FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "mc_tracked_owner_insert"
  ON public.mc_tracked_jobs FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND status IN ('discovered', 'saved')
    AND applied_at IS NULL
  );
CREATE POLICY "mc_tracked_owner_update"
  ON public.mc_tracked_jobs FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "mc_tracked_owner_delete"
  ON public.mc_tracked_jobs FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.mc_tracked_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.mc_tracked_jobs TO authenticated;
GRANT UPDATE (
  scanned_job_id, job_title, company, location, apply_url, jd_md,
  tailored_resume_id, clicked_at, notes, deleted_at
) ON public.mc_tracked_jobs TO authenticated;
GRANT ALL ON public.mc_tracked_jobs TO service_role;

DROP POLICY IF EXISTS "mc_history_owner_insert" ON public.mc_status_history;
REVOKE ALL ON public.mc_status_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mc_status_history TO authenticated;
REVOKE ALL ON public.mc_status_history FROM service_role;
GRANT SELECT, INSERT ON public.mc_status_history TO service_role;

CREATE OR REPLACE FUNCTION public.mc_advance_tracked_job_from_email(
  p_job_id uuid,
  p_user_id uuid,
  p_session_id uuid,
  p_expected_status text,
  p_new_status text,
  p_email_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_expected_status NOT IN (
      'discovered', 'saved', 'applied', 'viewed', 'interview',
      'take_home', 'offer', 'hold', 'rejected', 'withdrawn'
    )
    OR p_new_status NOT IN (
      'discovered', 'saved', 'applied', 'viewed', 'interview',
      'take_home', 'offer', 'hold', 'rejected', 'withdrawn'
    )
    OR p_expected_status = p_new_status
  THEN
    RAISE EXCEPTION 'invalid tracked-job transition';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.mc_inbound_emails email
    WHERE email.id = p_email_id
      AND email.user_id = p_user_id
      AND email.session_id = p_session_id
      AND email.tracked_job_id = p_job_id
  ) THEN
    RAISE EXCEPTION 'email does not belong to the tracked application';
  END IF;

  UPDATE public.mc_tracked_jobs job
  SET status = p_new_status,
      applied_at = CASE
        WHEN p_new_status = 'applied' THEN COALESCE(job.applied_at, now())
        ELSE job.applied_at
      END
  WHERE job.id = p_job_id
    AND job.user_id = p_user_id
    AND job.session_id = p_session_id
    AND job.status = p_expected_status
    AND job.deleted_at IS NULL
  RETURNING job.id INTO updated_id;
  IF updated_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.mc_status_history (
    tracked_job_id, user_id, status_from, status_to, source, email_id
  ) VALUES (
    p_job_id, p_user_id, p_expected_status, p_new_status, 'email', p_email_id
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.mc_move_tracked_job(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mc_move_tracked_job(uuid, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.mc_advance_tracked_job_from_email(
  uuid, uuid, uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mc_advance_tracked_job_from_email(
  uuid, uuid, uuid, text, text, uuid
) TO service_role;

-- Parsed inbox rows are service-generated; the browser may only read its rows
-- and change the read marker. This also removes default TRUNCATE grants.
REVOKE ALL ON public.mc_inbound_emails FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mc_inbound_emails TO authenticated;
GRANT UPDATE (is_read) ON public.mc_inbound_emails TO authenticated;
GRANT ALL ON public.mc_inbound_emails TO service_role;
REVOKE ALL ON public.mc_gmail_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.mc_gmail_connections TO authenticated;
GRANT ALL ON public.mc_gmail_connections TO service_role;

-- Manual URLs are review-only and must never enter the automated scanner.
UPDATE public.scan_companies
SET enabled = false
WHERE api_type = 'manual' AND enabled IS DISTINCT FROM false;
ALTER TABLE public.scan_companies
  DROP CONSTRAINT IF EXISTS scan_companies_manual_disabled_check;
ALTER TABLE public.scan_companies
  ADD CONSTRAINT scan_companies_manual_disabled_check
    CHECK (api_type <> 'manual' OR enabled = false) NOT VALID;
ALTER TABLE public.scan_companies
  VALIDATE CONSTRAINT scan_companies_manual_disabled_check;

-- Remove writable schemas from the effective search_path of privileged
-- functions whose bodies schema-qualify database objects.
ALTER FUNCTION public.append_applypass_task_log(uuid, jsonb)
  SET search_path = '';
ALTER FUNCTION public.auto_assign_admin_role() SET search_path = '';
ALTER FUNCTION public.claim_applypass_task(text) SET search_path = '';
ALTER FUNCTION public.enforce_continuous_apply_caps() SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.handle_new_user_access_control() SET search_path = '';
ALTER FUNCTION public.has_role(uuid, public.app_role) SET search_path = '';
ALTER FUNCTION public.increment_ai_usage(uuid, text, integer, integer)
  SET search_path = '';
ALTER FUNCTION public.mc_enforce_active_session_limit() SET search_path = '';
ALTER FUNCTION public.mc_get_gmail_tokens(uuid) SET search_path = '';
ALTER FUNCTION public.mc_store_gmail_tokens(uuid, text, text)
  SET search_path = '';
ALTER FUNCTION public.mc_update_gmail_access_token(uuid, text)
  SET search_path = '';
ALTER FUNCTION public.reap_stale_applypass_tasks() SET search_path = '';
ALTER FUNCTION public.record_app_incident(
  text, text, text, text, text, text, text, jsonb
) SET search_path = '';
ALTER FUNCTION public.reset_agent_action_counters() SET search_path = '';
ALTER FUNCTION public.write_audit_log(
  uuid, text, text, text, uuid, jsonb, text, text
) SET search_path = '';
ALTER FUNCTION public.prevent_application_receipt_mutation()
  SET search_path = '';

RESET lock_timeout;
RESET statement_timeout;

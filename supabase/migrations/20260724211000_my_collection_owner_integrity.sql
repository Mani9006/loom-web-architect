-- Make ownership and workspace identity database invariants.
--
-- Browser RLS does not protect service-role workers. These composite keys
-- prevent Gmail polling, resume tailoring, and application status workers
-- from ever crossing a user's or workspace's boundary.

SET lock_timeout = '5s';
SET statement_timeout = '2min';

-- Abort rather than silently "repairing" ownership. A failed deployment can
-- quarantine the offending rows after an operator reviews them.
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
    SELECT s.id
    FROM public.mc_sessions s
    LEFT JOIN public.resumes r ON r.id = s.master_resume_id
    WHERE s.master_resume_id IS NOT NULL
      AND (r.id IS NULL OR r.user_id IS DISTINCT FROM s.user_id)

    UNION ALL
    SELECT e.id
    FROM public.mc_evaluations e
    LEFT JOIN public.mc_sessions s ON s.id = e.session_id
    WHERE s.id IS NULL OR s.user_id IS DISTINCT FROM e.user_id

    UNION ALL
    SELECT t.id
    FROM public.mc_tailored_resumes t
    LEFT JOIN public.mc_sessions s ON s.id = t.session_id
    WHERE s.id IS NULL OR s.user_id IS DISTINCT FROM t.user_id

    UNION ALL
    SELECT t.id
    FROM public.mc_tailored_resumes t
    LEFT JOIN public.mc_evaluations e ON e.id = t.source_evaluation_id
    WHERE t.source_evaluation_id IS NOT NULL
      AND (
        e.id IS NULL
        OR e.user_id IS DISTINCT FROM t.user_id
        OR e.session_id IS DISTINCT FROM t.session_id
      )

    UNION ALL
    SELECT j.id
    FROM public.mc_tracked_jobs j
    LEFT JOIN public.mc_sessions s ON s.id = j.session_id
    WHERE s.id IS NULL OR s.user_id IS DISTINCT FROM j.user_id

    UNION ALL
    SELECT j.id
    FROM public.mc_tracked_jobs j
    LEFT JOIN public.mc_tailored_resumes t ON t.id = j.tailored_resume_id
    WHERE j.tailored_resume_id IS NOT NULL
      AND (
        t.id IS NULL
        OR t.user_id IS DISTINCT FROM j.user_id
        OR t.session_id IS DISTINCT FROM j.session_id
      )

    UNION ALL
    SELECT e.id
    FROM public.mc_inbound_emails e
    LEFT JOIN public.mc_sessions s ON s.id = e.session_id
    WHERE e.session_id IS NOT NULL
      AND (s.id IS NULL OR s.user_id IS DISTINCT FROM e.user_id)

    UNION ALL
    SELECT e.id
    FROM public.mc_inbound_emails e
    LEFT JOIN public.mc_tracked_jobs j ON j.id = e.tracked_job_id
    WHERE e.tracked_job_id IS NOT NULL
      AND (
        j.id IS NULL
        OR j.user_id IS DISTINCT FROM e.user_id
        OR j.session_id IS DISTINCT FROM e.session_id
      )

    UNION ALL
    SELECT h.id
    FROM public.mc_status_history h
    LEFT JOIN public.mc_tracked_jobs j ON j.id = h.tracked_job_id
    WHERE j.id IS NULL OR j.user_id IS DISTINCT FROM h.user_id

    UNION ALL
    SELECT h.id
    FROM public.mc_status_history h
    LEFT JOIN public.mc_inbound_emails e ON e.id = h.email_id
    WHERE h.email_id IS NOT NULL
      AND (
        e.id IS NULL
        OR e.user_id IS DISTINCT FROM h.user_id
        OR e.tracked_job_id IS DISTINCT FROM h.tracked_job_id
      )

    UNION ALL
    SELECT u.id
    FROM public.mc_ai_usage u
    LEFT JOIN public.mc_sessions s ON s.id = u.session_id
    WHERE s.id IS NULL OR s.user_id IS DISTINCT FROM u.user_id

    UNION ALL
    SELECT c.id
    FROM public.mc_gmail_connections c
    LEFT JOIN public.mc_sessions s ON s.id = c.session_id
    WHERE s.id IS NULL OR s.user_id IS DISTINCT FROM c.user_id

    UNION ALL
    SELECT r.id
    FROM public.mc_company_research r
    LEFT JOIN public.mc_sessions s ON s.id = r.session_id
    WHERE s.id IS NULL OR s.user_id IS DISTINCT FROM r.user_id
  ) violations;

  IF invalid_count <> 0 THEN
    RAISE EXCEPTION
      'My Collection ownership migration aborted: % invalid relationship(s) require quarantine',
      invalid_count;
  END IF;
END
$$;

ALTER TABLE public.mc_inbound_emails
  ADD COLUMN IF NOT EXISTS gmail_connection_id uuid;

UPDATE public.mc_inbound_emails e
SET gmail_connection_id = c.id
FROM public.mc_gmail_connections c
WHERE e.gmail_connection_id IS NULL
  AND e.user_id = c.user_id
  AND e.session_id = c.session_id;

ALTER TABLE public.resumes
  ADD CONSTRAINT resumes_id_user_unique UNIQUE (id, user_id);
ALTER TABLE public.user_documents
  ADD CONSTRAINT user_documents_id_user_unique UNIQUE (id, user_id);
ALTER TABLE public.mc_sessions
  ADD CONSTRAINT mc_sessions_id_user_unique UNIQUE (id, user_id);
ALTER TABLE public.mc_evaluations
  ADD CONSTRAINT mc_evaluations_id_user_session_unique UNIQUE (id, user_id, session_id);
ALTER TABLE public.mc_tailored_resumes
  ADD CONSTRAINT mc_tailored_resumes_id_user_session_unique UNIQUE (id, user_id, session_id);
ALTER TABLE public.mc_tracked_jobs
  ADD CONSTRAINT mc_tracked_jobs_id_user_unique UNIQUE (id, user_id),
  ADD CONSTRAINT mc_tracked_jobs_id_user_session_unique UNIQUE (id, user_id, session_id);
ALTER TABLE public.mc_gmail_connections
  ADD CONSTRAINT mc_gmail_connections_id_user_unique UNIQUE (id, user_id),
  ADD CONSTRAINT mc_gmail_connections_id_user_session_unique UNIQUE (id, user_id, session_id);
ALTER TABLE public.mc_inbound_emails
  ADD CONSTRAINT mc_inbound_emails_id_user_job_unique UNIQUE (id, user_id, tracked_job_id);
ALTER TABLE public.applypass_tasks
  ADD CONSTRAINT applypass_tasks_id_user_unique UNIQUE (id, user_id);
ALTER TABLE public.draft_applications
  ADD CONSTRAINT draft_applications_id_user_unique UNIQUE (id, user_id);

ALTER TABLE public.resumes
  ADD CONSTRAINT resumes_user_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users (id)
  ON DELETE CASCADE
  NOT VALID,
  ADD CONSTRAINT resumes_source_document_owner_fkey
  FOREIGN KEY (source_document_id, user_id)
  REFERENCES public.user_documents (id, user_id)
  ON DELETE SET NULL (source_document_id)
  NOT VALID;

ALTER TABLE public.mc_sessions
  ADD CONSTRAINT mc_sessions_resume_owner_fkey
  FOREIGN KEY (master_resume_id, user_id)
  REFERENCES public.resumes (id, user_id)
  ON DELETE SET NULL (master_resume_id)
  NOT VALID;

ALTER TABLE public.mc_evaluations
  ADD CONSTRAINT mc_evaluations_session_owner_fkey
  FOREIGN KEY (session_id, user_id)
  REFERENCES public.mc_sessions (id, user_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.mc_tailored_resumes
  ADD CONSTRAINT mc_tailored_resumes_session_owner_fkey
  FOREIGN KEY (session_id, user_id)
  REFERENCES public.mc_sessions (id, user_id)
  ON DELETE CASCADE
  NOT VALID,
  ADD CONSTRAINT mc_tailored_resumes_evaluation_owner_session_fkey
  FOREIGN KEY (source_evaluation_id, user_id, session_id)
  REFERENCES public.mc_evaluations (id, user_id, session_id)
  ON DELETE SET NULL (source_evaluation_id)
  NOT VALID;

ALTER TABLE public.mc_tracked_jobs
  ADD CONSTRAINT mc_tracked_jobs_session_owner_fkey
  FOREIGN KEY (session_id, user_id)
  REFERENCES public.mc_sessions (id, user_id)
  ON DELETE CASCADE
  NOT VALID,
  ADD CONSTRAINT mc_tracked_jobs_resume_owner_session_fkey
  FOREIGN KEY (tailored_resume_id, user_id, session_id)
  REFERENCES public.mc_tailored_resumes (id, user_id, session_id)
  ON DELETE SET NULL (tailored_resume_id)
  NOT VALID;

ALTER TABLE public.mc_gmail_connections
  ADD CONSTRAINT mc_gmail_connections_session_owner_fkey
  FOREIGN KEY (session_id, user_id)
  REFERENCES public.mc_sessions (id, user_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.mc_inbound_emails
  ADD CONSTRAINT mc_inbound_emails_connection_owner_fkey
  FOREIGN KEY (gmail_connection_id, user_id)
  REFERENCES public.mc_gmail_connections (id, user_id)
  ON DELETE SET NULL (gmail_connection_id)
  NOT VALID,
  ADD CONSTRAINT mc_inbound_emails_connection_owner_session_fkey
  FOREIGN KEY (gmail_connection_id, user_id, session_id)
  REFERENCES public.mc_gmail_connections (id, user_id, session_id)
  ON DELETE SET NULL (gmail_connection_id)
  NOT VALID,
  ADD CONSTRAINT mc_inbound_emails_session_owner_fkey
  FOREIGN KEY (session_id, user_id)
  REFERENCES public.mc_sessions (id, user_id)
  ON DELETE SET NULL (session_id)
  NOT VALID,
  ADD CONSTRAINT mc_inbound_emails_job_owner_fkey
  FOREIGN KEY (tracked_job_id, user_id)
  REFERENCES public.mc_tracked_jobs (id, user_id)
  ON DELETE SET NULL (tracked_job_id)
  NOT VALID,
  ADD CONSTRAINT mc_inbound_emails_job_owner_session_fkey
  FOREIGN KEY (tracked_job_id, user_id, session_id)
  REFERENCES public.mc_tracked_jobs (id, user_id, session_id)
  ON DELETE SET NULL (tracked_job_id)
  NOT VALID;

ALTER TABLE public.mc_status_history
  ADD CONSTRAINT mc_status_history_job_owner_fkey
  FOREIGN KEY (tracked_job_id, user_id)
  REFERENCES public.mc_tracked_jobs (id, user_id)
  ON DELETE CASCADE
  NOT VALID,
  ADD CONSTRAINT mc_status_history_email_owner_job_fkey
  FOREIGN KEY (email_id, user_id, tracked_job_id)
  REFERENCES public.mc_inbound_emails (id, user_id, tracked_job_id)
  ON DELETE SET NULL (email_id)
  NOT VALID;

ALTER TABLE public.mc_ai_usage
  ADD CONSTRAINT mc_ai_usage_session_owner_fkey
  FOREIGN KEY (session_id, user_id)
  REFERENCES public.mc_sessions (id, user_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.mc_company_research
  ADD CONSTRAINT mc_company_research_session_owner_fkey
  FOREIGN KEY (session_id, user_id)
  REFERENCES public.mc_sessions (id, user_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.mc_sessions VALIDATE CONSTRAINT mc_sessions_resume_owner_fkey;
ALTER TABLE public.resumes VALIDATE CONSTRAINT resumes_user_fkey;
ALTER TABLE public.resumes VALIDATE CONSTRAINT resumes_source_document_owner_fkey;
ALTER TABLE public.mc_evaluations VALIDATE CONSTRAINT mc_evaluations_session_owner_fkey;
ALTER TABLE public.mc_tailored_resumes
  VALIDATE CONSTRAINT mc_tailored_resumes_session_owner_fkey;
ALTER TABLE public.mc_tailored_resumes
  VALIDATE CONSTRAINT mc_tailored_resumes_evaluation_owner_session_fkey;
ALTER TABLE public.mc_tracked_jobs
  VALIDATE CONSTRAINT mc_tracked_jobs_session_owner_fkey;
ALTER TABLE public.mc_tracked_jobs
  VALIDATE CONSTRAINT mc_tracked_jobs_resume_owner_session_fkey;
ALTER TABLE public.mc_gmail_connections
  VALIDATE CONSTRAINT mc_gmail_connections_session_owner_fkey;
ALTER TABLE public.mc_inbound_emails
  VALIDATE CONSTRAINT mc_inbound_emails_connection_owner_fkey;
ALTER TABLE public.mc_inbound_emails
  VALIDATE CONSTRAINT mc_inbound_emails_connection_owner_session_fkey;
ALTER TABLE public.mc_inbound_emails
  VALIDATE CONSTRAINT mc_inbound_emails_session_owner_fkey;
ALTER TABLE public.mc_inbound_emails
  VALIDATE CONSTRAINT mc_inbound_emails_job_owner_fkey;
ALTER TABLE public.mc_inbound_emails
  VALIDATE CONSTRAINT mc_inbound_emails_job_owner_session_fkey;
ALTER TABLE public.mc_status_history
  VALIDATE CONSTRAINT mc_status_history_job_owner_fkey;
ALTER TABLE public.mc_status_history
  VALIDATE CONSTRAINT mc_status_history_email_owner_job_fkey;
ALTER TABLE public.mc_ai_usage
  VALIDATE CONSTRAINT mc_ai_usage_session_owner_fkey;
ALTER TABLE public.mc_company_research
  VALIDATE CONSTRAINT mc_company_research_session_owner_fkey;

DROP INDEX IF EXISTS public.mc_emails_user_message_idx;
CREATE UNIQUE INDEX mc_emails_connection_message_unique
  ON public.mc_inbound_emails (gmail_connection_id, message_id)
  WHERE gmail_connection_id IS NOT NULL AND message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mc_sessions_resume_owner_idx
  ON public.mc_sessions (master_resume_id, user_id)
  WHERE master_resume_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mc_tailored_evaluation_owner_idx
  ON public.mc_tailored_resumes (source_evaluation_id, user_id, session_id)
  WHERE source_evaluation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mc_tracked_resume_owner_idx
  ON public.mc_tracked_jobs (tailored_resume_id, user_id, session_id)
  WHERE tailored_resume_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mc_inbound_session_owner_idx
  ON public.mc_inbound_emails (session_id, user_id)
  WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mc_history_email_owner_idx
  ON public.mc_status_history (email_id, user_id, tracked_job_id)
  WHERE email_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.mc_keep_gmail_connection_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.session_id IS DISTINCT FROM OLD.session_id THEN
    RAISE EXCEPTION 'Gmail connection ownership cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mc_gmail_keep_owner ON public.mc_gmail_connections;
CREATE TRIGGER mc_gmail_keep_owner
  BEFORE UPDATE OF user_id, session_id ON public.mc_gmail_connections
  FOR EACH ROW EXECUTE FUNCTION public.mc_keep_gmail_connection_owner();

REVOKE ALL ON FUNCTION public.mc_keep_gmail_connection_owner()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mc_keep_gmail_connection_owner()
  TO service_role;

-- OAuth metadata and parsed application mail are service-generated. The
-- browser may read them, disconnect Gmail, and change only the read marker.
DROP POLICY IF EXISTS "mc_gmail_owner_all" ON public.mc_gmail_connections;
DROP POLICY IF EXISTS "mc_gmail_owner_select" ON public.mc_gmail_connections;
DROP POLICY IF EXISTS "mc_gmail_owner_delete" ON public.mc_gmail_connections;
CREATE POLICY "mc_gmail_owner_select"
  ON public.mc_gmail_connections
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "mc_gmail_owner_delete"
  ON public.mc_gmail_connections
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.mc_gmail_connections
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.mc_gmail_connections TO authenticated;
GRANT ALL ON public.mc_gmail_connections TO service_role;

DROP POLICY IF EXISTS "mc_emails_owner_all" ON public.mc_inbound_emails;
DROP POLICY IF EXISTS "mc_emails_owner_select" ON public.mc_inbound_emails;
DROP POLICY IF EXISTS "mc_emails_owner_mark_read" ON public.mc_inbound_emails;
CREATE POLICY "mc_emails_owner_select"
  ON public.mc_inbound_emails
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "mc_emails_owner_mark_read"
  ON public.mc_inbound_emails
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.mc_inbound_emails
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mc_inbound_emails TO authenticated;
GRANT UPDATE (is_read) ON public.mc_inbound_emails TO authenticated;
GRANT ALL ON public.mc_inbound_emails TO service_role;

-- Status history is an audit trail. Signed-in clients can read their own rows,
-- but status transitions and their provenance are written atomically by the
-- service-owned workflow/RPCs.
DROP POLICY IF EXISTS "mc_history_owner_insert" ON public.mc_status_history;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.mc_status_history
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mc_status_history TO authenticated;
REVOKE ALL ON public.mc_status_history FROM service_role;
GRANT SELECT, INSERT ON public.mc_status_history TO service_role;

CREATE OR REPLACE FUNCTION public.mc_move_tracked_job(
  p_job_id uuid,
  p_new_status text
) RETURNS TABLE (
  status text,
  applied_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  previous_status text;
  previous_applied_at timestamptz;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_new_status NOT IN (
    'discovered', 'saved', 'applied', 'viewed', 'interview',
    'take_home', 'offer', 'hold', 'rejected', 'withdrawn'
  ) THEN
    RAISE EXCEPTION 'invalid tracked-job status';
  END IF;

  SELECT j.status, j.applied_at
  INTO previous_status, previous_applied_at
  FROM public.mc_tracked_jobs j
  WHERE j.id = p_job_id
    AND j.user_id = caller_id
    AND j.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tracked job not found';
  END IF;
  IF previous_status = p_new_status THEN
    RETURN QUERY SELECT previous_status, previous_applied_at;
    RETURN;
  END IF;

  UPDATE public.mc_tracked_jobs j
  SET status = p_new_status,
      applied_at = CASE
        WHEN p_new_status = 'applied' THEN COALESCE(j.applied_at, now())
        ELSE j.applied_at
      END
  WHERE j.id = p_job_id
    AND j.user_id = caller_id
  RETURNING j.status, j.applied_at
  INTO status, applied_at;

  INSERT INTO public.mc_status_history (
    tracked_job_id,
    user_id,
    status_from,
    status_to,
    source
  ) VALUES (
    p_job_id,
    caller_id,
    previous_status,
    p_new_status,
    'manual'
  );

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.mc_move_tracked_job(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mc_move_tracked_job(uuid, text)
  TO authenticated;

-- Gmail-derived status movement and its audit row are one transaction.
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
  IF NOT EXISTS (
    SELECT 1
    FROM public.mc_inbound_emails email
    WHERE email.id = p_email_id
      AND email.user_id = p_user_id
      AND email.session_id = p_session_id
      AND email.tracked_job_id = p_job_id
  ) THEN
    RAISE EXCEPTION 'email does not belong to the tracked application';
  END IF;

  UPDATE public.mc_tracked_jobs
  SET status = p_new_status
  WHERE id = p_job_id
    AND user_id = p_user_id
    AND session_id = p_session_id
    AND status = p_expected_status
  RETURNING id INTO updated_id;

  IF updated_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.mc_status_history (
    tracked_job_id,
    user_id,
    status_from,
    status_to,
    source,
    email_id
  ) VALUES (
    p_job_id,
    p_user_id,
    p_expected_status,
    p_new_status,
    'email',
    p_email_id
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.mc_advance_tracked_job_from_email(
  uuid, uuid, uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mc_advance_tracked_job_from_email(
  uuid, uuid, uuid, text, text, uuid
) TO service_role;

RESET lock_timeout;
RESET statement_timeout;

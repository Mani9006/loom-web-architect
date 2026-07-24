-- Keep low-confidence or truncated imports out of the primary-resume slot.
--
-- The browser provides the review workflow, and Edge Functions independently
-- refuse matching/tailoring/submission. These triggers close the remaining
-- direct-database path: a client cannot assign an unsafe import as primary,
-- and an already-primary resume is detached if later provenance changes make
-- its confirmation invalid.

CREATE OR REPLACE FUNCTION public.resume_is_automation_ready(
  p_parse_quality JSONB,
  p_source_hash TEXT,
  p_source_document_id uuid,
  p_parser_version text,
  p_parsed_at timestamptz
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  quality JSONB := p_parse_quality;
  confirmation JSONB;
  warning_text TEXT;
  requires_review BOOLEAN := FALSE;
  confirmed_at TIMESTAMPTZ;
  has_provenance BOOLEAN;
BEGIN
  has_provenance :=
    quality IS NOT NULL
    OR NULLIF(BTRIM(p_source_hash), '') IS NOT NULL
    OR p_source_document_id IS NOT NULL
    OR NULLIF(BTRIM(p_parser_version), '') IS NOT NULL
    OR p_parsed_at IS NOT NULL;

  -- A manually-created résumé has no import provenance. Once any provenance
  -- field exists, require the complete immutable import record.
  IF NOT has_provenance THEN
    RETURN TRUE;
  END IF;
  IF quality IS NULL THEN
    RETURN FALSE;
  END IF;
  IF jsonb_typeof(quality) <> 'object' THEN
    RETURN FALSE;
  END IF;
  IF NULLIF(BTRIM(p_source_hash), '') IS NULL
    OR p_source_document_id IS NULL
    OR NULLIF(BTRIM(p_parser_version), '') IS NULL
    OR p_parsed_at IS NULL
  THEN
    RETURN FALSE;
  END IF;

  requires_review :=
    COALESCE(quality ->> 'status', '') <> 'passed'
    OR COALESCE(quality ->> 'truncated' = 'true', FALSE);

  IF jsonb_typeof(quality -> 'warnings') = 'array' THEN
    FOR warning_text IN
      SELECT jsonb_array_elements_text(quality -> 'warnings')
    LOOP
      IF warning_text ~* '(truncat|parser limit|source exceeded)' THEN
        requires_review := TRUE;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF NOT requires_review THEN
    RETURN TRUE;
  END IF;

  confirmation := quality -> 'review_confirmation';
  IF jsonb_typeof(confirmation) <> 'object'
    OR confirmation ->> 'method' <> 'user_review'
    OR confirmation ->> 'version' <> '1'
  THEN
    RETURN FALSE;
  END IF;

  BEGIN
    confirmed_at := (confirmation ->> 'confirmed_at')::TIMESTAMPTZ;
  EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
  END;
  IF confirmed_at IS NULL THEN
    RETURN FALSE;
  END IF;

  IF COALESCE(confirmation ->> 'source_hash', '') <> BTRIM(p_source_hash) THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- Provenance is immutable from the browser. Users may edit résumé content,
-- while an explicit owner-bound RPC appends the only permitted review marker.
REVOKE UPDATE ON public.resumes FROM PUBLIC, anon, authenticated;
GRANT UPDATE (
  title,
  personal_info,
  summary,
  experience,
  education,
  skills,
  projects,
  certifications,
  languages,
  template,
  section_order,
  volunteer,
  awards,
  custom_sections
) ON public.resumes TO authenticated;
REVOKE ALL ON public.resumes FROM anon;
GRANT SELECT, INSERT, DELETE ON public.resumes TO authenticated;
GRANT ALL ON public.resumes TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_resume_import_review(p_resume_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  candidate public.resumes%ROWTYPE;
  confirmed_quality jsonb;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT *
  INTO candidate
  FROM public.resumes
  WHERE id = p_resume_id
    AND user_id = caller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'resume not found';
  END IF;
  IF jsonb_typeof(candidate.parse_quality) <> 'object'
    OR NULLIF(BTRIM(candidate.source_hash), '') IS NULL
    OR candidate.source_document_id IS NULL
    OR NULLIF(BTRIM(candidate.parser_version), '') IS NULL
    OR candidate.parsed_at IS NULL
  THEN
    RAISE EXCEPTION 'resume import provenance is incomplete';
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
  WHERE id = candidate.id
    AND user_id = caller_id;

  RETURN confirmed_quality;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_resume_import_review(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_resume_import_review(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_primary_resume_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  candidate public.resumes%ROWTYPE;
BEGIN
  IF NEW.primary_resume_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO candidate
  FROM public.resumes
  WHERE id = NEW.primary_resume_id
    AND user_id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'primary resume must belong to the profile owner'
      USING ERRCODE = '23514';
  END IF;

  IF NOT public.resume_is_automation_ready(
    candidate.parse_quality,
    candidate.source_hash,
    candidate.source_document_id,
    candidate.parser_version,
    candidate.parsed_at
  ) THEN
    RAISE EXCEPTION 'review and confirm this imported resume before making it primary'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_primary_resume_review_guard ON public.profiles;
CREATE TRIGGER profiles_primary_resume_review_guard
  BEFORE INSERT OR UPDATE OF primary_resume_id
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_primary_resume_review();

CREATE OR REPLACE FUNCTION public.detach_unsafe_primary_resume()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.resume_is_automation_ready(
    NEW.parse_quality,
    NEW.source_hash,
    NEW.source_document_id,
    NEW.parser_version,
    NEW.parsed_at
  ) THEN
    UPDATE public.profiles
    SET primary_resume_id = NULL
    WHERE primary_resume_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resumes_primary_review_invalidation ON public.resumes;
CREATE TRIGGER resumes_primary_review_invalidation
  AFTER UPDATE OF parse_quality, source_hash, source_document_id, parser_version, parsed_at
  ON public.resumes
  FOR EACH ROW
  WHEN (
    OLD.parse_quality IS DISTINCT FROM NEW.parse_quality
    OR OLD.source_hash IS DISTINCT FROM NEW.source_hash
    OR OLD.source_document_id IS DISTINCT FROM NEW.source_document_id
    OR OLD.parser_version IS DISTINCT FROM NEW.parser_version
    OR OLD.parsed_at IS DISTINCT FROM NEW.parsed_at
  )
  EXECUTE FUNCTION public.detach_unsafe_primary_resume();

-- Repair any unsafe historical assignment before the guards become relied on.
UPDATE public.profiles AS profile
SET primary_resume_id = NULL
FROM public.resumes AS resume
WHERE profile.primary_resume_id = resume.id
  AND NOT public.resume_is_automation_ready(
    resume.parse_quality,
    resume.source_hash,
    resume.source_document_id,
    resume.parser_version,
    resume.parsed_at
  );

-- Repair any historical cross-owner assignment before adding the invariant.
UPDATE public.profiles AS profile
SET primary_resume_id = NULL
WHERE profile.primary_resume_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.resumes resume
    WHERE resume.id = profile.primary_resume_id
      AND resume.user_id = profile.user_id
  );

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_primary_resume_owner_fkey
  FOREIGN KEY (primary_resume_id, user_id)
  REFERENCES public.resumes (id, user_id)
  ON DELETE SET NULL (primary_resume_id)
  NOT VALID;
ALTER TABLE public.profiles
  VALIDATE CONSTRAINT profiles_primary_resume_owner_fkey;

REVOKE ALL ON FUNCTION public.resume_is_automation_ready(
  JSONB, TEXT, uuid, text, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_primary_resume_review() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.detach_unsafe_primary_resume() FROM PUBLIC;

COMMENT ON FUNCTION public.resume_is_automation_ready(
  JSONB, TEXT, uuid, text, timestamptz
) IS
  'Returns false for an unconfirmed low-confidence or truncated resume import.';

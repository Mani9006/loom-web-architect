-- Sanitized, deduplicated client incident stream.
-- Raw form values, document text, query strings, and credentials must never be
-- sent here. The browser recorder strips common secrets before calling the RPC.

CREATE TABLE IF NOT EXISTS public.app_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production'
    CHECK (environment IN ('production', 'staging', 'development')),
  release_sha TEXT NOT NULL DEFAULT 'unknown',
  severity TEXT NOT NULL DEFAULT 'error'
    CHECK (severity IN ('warning', 'error', 'fatal')),
  route TEXT NOT NULL DEFAULT '/',
  message TEXT NOT NULL,
  stack_trace TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'triaged', 'in_progress', 'resolved', 'ignored')),
  occurrences INTEGER NOT NULL DEFAULT 1 CHECK (occurrences > 0),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, fingerprint, environment, release_sha)
);

CREATE INDEX IF NOT EXISTS idx_app_incidents_open_recent
  ON public.app_incidents (status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_incidents_user_recent
  ON public.app_incidents (user_id, last_seen_at DESC);

ALTER TABLE public.app_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own incidents" ON public.app_incidents;
CREATE POLICY "Users can view their own incidents"
  ON public.app_incidents FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all incidents" ON public.app_incidents;
CREATE POLICY "Admins can view all incidents"
  ON public.app_incidents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update incidents" ON public.app_incidents;
CREATE POLICY "Admins can update incidents"
  ON public.app_incidents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.record_app_incident(
  p_fingerprint TEXT,
  p_environment TEXT,
  p_release_sha TEXT,
  p_severity TEXT,
  p_route TEXT,
  p_message TEXT,
  p_stack_trace TEXT DEFAULT NULL,
  p_context JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_incident_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_environment NOT IN ('production', 'staging', 'development') THEN
    RAISE EXCEPTION 'Invalid environment';
  END IF;

  IF p_severity NOT IN ('warning', 'error', 'fatal') THEN
    RAISE EXCEPTION 'Invalid severity';
  END IF;

  INSERT INTO public.app_incidents (
    user_id, fingerprint, environment, release_sha, severity, route,
    message, stack_trace, context
  ) VALUES (
    v_user_id,
    left(p_fingerprint, 96),
    p_environment,
    left(coalesce(nullif(p_release_sha, ''), 'unknown'), 96),
    p_severity,
    left(coalesce(nullif(p_route, ''), '/'), 300),
    left(p_message, 1000),
    left(p_stack_trace, 6000),
    coalesce(p_context, '{}'::jsonb)
  )
  ON CONFLICT (user_id, fingerprint, environment, release_sha)
  DO UPDATE SET
    occurrences = app_incidents.occurrences + 1,
    severity = EXCLUDED.severity,
    route = EXCLUDED.route,
    message = EXCLUDED.message,
    stack_trace = EXCLUDED.stack_trace,
    context = EXCLUDED.context,
    status = CASE
      WHEN app_incidents.status IN ('resolved', 'ignored') THEN 'open'
      ELSE app_incidents.status
    END,
    last_seen_at = now()
  RETURNING id INTO v_incident_id;

  RETURN v_incident_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_app_incident(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_app_incident(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- Meter only paid web-search fallbacks. Zero-model scans and cached reads stay
-- free, while expensive provider fallbacks receive an explicit daily ceiling.
ALTER TABLE public.ai_usage_daily DROP CONSTRAINT IF EXISTS ai_usage_daily_kind_check;
ALTER TABLE public.ai_usage_daily ADD CONSTRAINT ai_usage_daily_kind_check
  CHECK (kind IN (
    'search', 'evaluation', 'tailor', 'draft_answers',
    'linkedin', 'ats', 'story', 'research', 'followup'
  ));

-- ============================================================================
-- My Collection AI worker — cloud fallback for the "Tailor to job" pipeline.
-- ============================================================================
-- mc_ai_jobs was designed to be drained by a worker running on the user's own
-- machine (see src/lib/mc-ai-jobs.ts), but no such worker ships anywhere in
-- this repo or its scheduled infra. Every "Tailor to job" click in My
-- Collection (BoardTab, DiscoverTab) enqueues a row and then polls forever:
-- nothing has ever picked it up, so the feature has never actually produced
-- a tailored resume for a normal user.
--
-- This adds a claim RPC (mirrors claim_applypass_task's FOR UPDATE SKIP
-- LOCKED pattern) and a pg_cron schedule that invokes the new mc-ai-worker
-- edge function every minute. The worker only claims kind='tailor' jobs —
-- those are a single self-contained prompt asking for markdown text back,
-- answerable with the existing callLlm() infra used elsewhere in this repo.
-- kind='other' (DiscoverTab's agentic "find jobs" search, which needs real
-- Bash/WebSearch tool access) is deliberately left alone; it still requires
-- an external agentic worker and this migration does not change that.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_mc_ai_jobs(p_kinds text[], p_limit integer DEFAULT 5)
RETURNS SETOF public.mc_ai_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT id
    FROM public.mc_ai_jobs
    WHERE status = 'queued'
      AND kind = ANY(p_kinds)
    ORDER BY priority DESC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_limit, 0)
  )
  UPDATE public.mc_ai_jobs j
  SET status = 'running',
      started_at = now(),
      attempts = j.attempts + 1
  FROM candidate
  WHERE j.id = candidate.id
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_mc_ai_jobs(text[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mc_ai_jobs(text[], integer) TO service_role;

-- ── pg_cron: drain the queue every minute ──────────────────────────────────
-- Mirrors the existing pg_cron → net.http_post pattern used by
-- career-ops-hourly-scan and mc-gmail-poll-5min. A no-op on environments
-- without pg_cron/pg_net provisioned (e.g. local dev).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('mc-ai-worker-1min')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mc-ai-worker-1min');
    PERFORM cron.schedule(
      'mc-ai-worker-1min',
      '* * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.mc_ai_worker_url', true),
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

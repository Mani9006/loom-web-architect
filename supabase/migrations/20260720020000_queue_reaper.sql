-- ApplyPass queue reaper — recover tasks whose worker died mid-run.
--
-- A worker heartbeats while it owns a task (claim sets heartbeat_at, every
-- progress log refreshes it). When the heartbeat goes stale the worker is
-- presumed dead: tasks with attempts left return to 'pending', tasks at
-- max_attempts fail permanently (the claim gate would never pick them up
-- again anyway, so without this they would sit 'running' forever).
--
-- attempt_count is NOT re-incremented here on purpose:
-- claim_applypass_task() already increments it when the worker picks the
-- task up, so the dead attempt was counted at claim time. Incrementing
-- again in the reaper would double-count and halve the retry budget.

CREATE OR REPLACE FUNCTION public.reap_stale_applypass_tasks()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  failed_count INTEGER := 0;
  requeued_count INTEGER := 0;
BEGIN
  -- Permanently fail stale tasks that exhausted their attempts.
  UPDATE public.applypass_tasks
  SET
    status = 'failed',
    error_message = 'Worker heartbeat lost and attempts exhausted; marked failed by the queue reaper.',
    locked_by = NULL,
    locked_at = NULL,
    completed_at = now(),
    updated_at = now(),
    run_log = COALESCE(run_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'level', 'error',
      'at', now(),
      'message', 'Queue reaper: heartbeat stale and attempts exhausted'
    ))
  WHERE status = 'running'
    AND attempt_count >= max_attempts
    -- heartbeat_at IS NULL covers rows claimed before heartbeats existed.
    AND (heartbeat_at IS NULL OR heartbeat_at < now() - interval '10 minutes');

  GET DIAGNOSTICS failed_count = ROW_COUNT;

  -- Re-queue stale tasks that still have attempts left. Status/lock columns
  -- return to the pre-claim state; claim_applypass_task() re-stamps them.
  UPDATE public.applypass_tasks
  SET
    status = 'pending',
    locked_by = NULL,
    locked_at = NULL,
    updated_at = now(),
    run_log = COALESCE(run_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'level', 'warn',
      'at', now(),
      'message', 'Queue reaper: heartbeat stale; task returned to pending'
    ))
  WHERE status = 'running'
    AND attempt_count < max_attempts
    AND (heartbeat_at IS NULL OR heartbeat_at < now() - interval '10 minutes');

  GET DIAGNOSTICS requeued_count = ROW_COUNT;

  RETURN failed_count + requeued_count;
END;
$$;

-- ── pg_cron: reap every five minutes ─────────────────────────────
-- Pure-SQL job; no edge function involved. Idempotent: statements above
-- only match rows still in the stale 'running' state, and the schedule is
-- recreated only after unscheduling any prior copy. The DO block no-ops
-- where pg_cron is not provisioned (local dev).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('applypass-queue-reaper')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'applypass-queue-reaper');
    PERFORM cron.schedule(
      'applypass-queue-reaper',
      '*/5 * * * *',
      $cron$SELECT public.reap_stale_applypass_tasks();$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not configured — skip silently
  NULL;
END $$;

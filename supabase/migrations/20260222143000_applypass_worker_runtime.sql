-- ApplyPass Worker Runtime Fields and RPC helpers

ALTER TABLE public.applypass_tasks
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS locked_by TEXT,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS run_log JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_applypass_tasks_status_created
  ON public.applypass_tasks (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_applypass_tasks_heartbeat
  ON public.applypass_tasks (heartbeat_at DESC);

CREATE OR REPLACE FUNCTION public.claim_applypass_task(p_worker_id TEXT)
RETURNS SETOF public.applypass_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed public.applypass_tasks;
BEGIN
  WITH candidate AS (
    SELECT id
    FROM public.applypass_tasks
    WHERE status = 'pending'
      AND attempt_count < max_attempts
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.applypass_tasks t
  SET
    status = 'running',
    locked_by = COALESCE(NULLIF(p_worker_id, ''), 'applypass-worker'),
    locked_at = now(),
    heartbeat_at = now(),
    started_at = COALESCE(t.started_at, now()),
    attempt_count = t.attempt_count + 1,
    updated_at = now()
  WHERE t.id IN (SELECT id FROM candidate)
  RETURNING t.* INTO claimed;

  IF claimed.id IS NOT NULL THEN
    RETURN NEXT claimed;
  END IF;

  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.append_applypass_task_log(
  p_task_id UUID,
  p_entry JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.applypass_tasks
  SET
    run_log = COALESCE(run_log, '[]'::jsonb) || jsonb_build_array(COALESCE(p_entry, '{}'::jsonb)),
    updated_at = now()
  WHERE id = p_task_id;
END;
$$;

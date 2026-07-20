-- Continuous Apply is an explicit, reversible account-level command.
-- The UI can target 400 application attempts per rolling product week and
-- 1,600 per calendar month, while the database remains the final concurrency-
-- safe enforcement point regardless of which API or worker creates a task.

ALTER TABLE public.user_job_prefs
  DROP CONSTRAINT IF EXISTS user_job_prefs_daily_apply_cap_check;

ALTER TABLE public.user_job_prefs
  ALTER COLUMN daily_apply_cap SET DEFAULT 60,
  ADD CONSTRAINT user_job_prefs_daily_apply_cap_check
    CHECK (daily_apply_cap BETWEEN 0 AND 75),
  ALTER COLUMN agent_max_actions_per_day SET DEFAULT 240;

UPDATE public.user_job_prefs
SET
  daily_apply_cap = CASE WHEN daily_apply_cap IN (5, 10) THEN 60 ELSE daily_apply_cap END,
  agent_max_actions_per_day = CASE WHEN agent_max_actions_per_day IN (20, 60) THEN 240 ELSE agent_max_actions_per_day END;

ALTER TABLE public.job_evaluations
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

DROP POLICY IF EXISTS "Users dismiss own evaluations" ON public.job_evaluations;
CREATE POLICY "Users dismiss own evaluations"
  ON public.job_evaluations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_job_evaluations_visible_feed
  ON public.job_evaluations (user_id, fit_score DESC, evaluated_at DESC)
  WHERE dismissed_at IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_continuous_apply_caps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_units INTEGER := 1;
  weekly_used BIGINT := 0;
  monthly_used BIGINT := 0;
  week_start TIMESTAMPTZ := date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  month_start TIMESTAMPTZ := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  IF NEW.status = 'canceled' THEN
    RETURN NEW;
  END IF;

  IF NEW.task_type <> 'career_ops_submit'
     AND jsonb_typeof(COALESCE(NEW.payload->'jobs', '[]'::jsonb)) = 'array' THEN
    requested_units := GREATEST(1, jsonb_array_length(NEW.payload->'jobs'));
  END IF;

  -- Serialize reservations for one account so parallel API calls cannot race
  -- past the same allowance.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 7192026));

  SELECT COALESCE(SUM(
    CASE
      WHEN task_type = 'career_ops_submit' THEN 1
      WHEN jsonb_typeof(COALESCE(payload->'jobs', '[]'::jsonb)) = 'array'
        THEN GREATEST(1, jsonb_array_length(payload->'jobs'))
      ELSE 1
    END
  ), 0)
  INTO weekly_used
  FROM public.applypass_tasks
  WHERE user_id = NEW.user_id
    AND created_at >= week_start
    AND status <> 'canceled';

  SELECT COALESCE(SUM(
    CASE
      WHEN task_type = 'career_ops_submit' THEN 1
      WHEN jsonb_typeof(COALESCE(payload->'jobs', '[]'::jsonb)) = 'array'
        THEN GREATEST(1, jsonb_array_length(payload->'jobs'))
      ELSE 1
    END
  ), 0)
  INTO monthly_used
  FROM public.applypass_tasks
  WHERE user_id = NEW.user_id
    AND created_at >= month_start
    AND status <> 'canceled';

  IF weekly_used + requested_units > 400 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Weekly application allowance reached (400).';
  END IF;

  IF monthly_used + requested_units > 1600 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Monthly application allowance reached (1600).';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_continuous_apply_caps_before_insert ON public.applypass_tasks;
CREATE TRIGGER enforce_continuous_apply_caps_before_insert
  BEFORE INSERT ON public.applypass_tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_continuous_apply_caps();

-- Revisit enabled accounts every ten minutes. Starting from the UI also
-- dispatches immediately; this schedule keeps the service running afterward.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('agents-orchestrator-hourly')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agents-orchestrator-hourly');
    PERFORM cron.unschedule('agents-orchestrator-continuous')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agents-orchestrator-continuous');
    PERFORM cron.schedule(
      'agents-orchestrator-continuous',
      '*/10 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.agents_orchestrator_url', true),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object('source', 'pg_cron_continuous')
      );
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

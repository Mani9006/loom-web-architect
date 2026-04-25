-- ─────────────────────────────────────────────────────────────
-- Auto-pilot agents — autonomous backend workers per user.
--
-- A scheduled orchestrator runs hourly, picks users with
-- `agent_enabled=true`, and dispatches an agent run for each.
-- The agent uses Claude tool-use to decide what to do (score new
-- matches, tailor high-scoring ones, draft follow-ups). Every
-- decision is logged to `agent_runs` for transparency.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.user_job_prefs
  ADD COLUMN IF NOT EXISTS agent_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.user_job_prefs
  ADD COLUMN IF NOT EXISTS last_agent_run_at TIMESTAMPTZ;

ALTER TABLE public.user_job_prefs
  ADD COLUMN IF NOT EXISTS agent_actions_today INT NOT NULL DEFAULT 0;

ALTER TABLE public.user_job_prefs
  ADD COLUMN IF NOT EXISTS agent_max_actions_per_day INT NOT NULL DEFAULT 20;

-- Per-run audit log. Each row = one orchestrated invocation of an
-- agent for a user. The `actions` JSONB array captures every tool
-- call the model made, so the user can see exactly what was done.
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent TEXT NOT NULL CHECK (agent IN ('job_hunter')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'capped')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  iterations INT NOT NULL DEFAULT 0,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{tool, input, result, ts}]
  summary TEXT, -- one-paragraph human summary of what happened
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_user
  ON public.agent_runs (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_status
  ON public.agent_runs (status, started_at DESC);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own agent runs" ON public.agent_runs;
CREATE POLICY "Users read own agent runs"
  ON public.agent_runs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read all agent runs" ON public.agent_runs;
CREATE POLICY "Admins read all agent runs"
  ON public.agent_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Daily reset of agent_actions_today (called by orchestrator at 00:05 UTC)
CREATE OR REPLACE FUNCTION public.reset_agent_action_counters()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.user_job_prefs
  SET agent_actions_today = 0
  WHERE agent_actions_today > 0;
END;
$$;

-- pg_cron schedules — best effort if pg_cron exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('agents-orchestrator-hourly')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agents-orchestrator-hourly');
    PERFORM cron.schedule(
      'agents-orchestrator-hourly',
      '13 * * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.agents_orchestrator_url', true),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object('source', 'pg_cron')
      );
      $cron$
    );

    PERFORM cron.unschedule('agents-daily-reset')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agents-daily-reset');
    PERFORM cron.schedule(
      'agents-daily-reset',
      '5 0 * * *',
      $cron$ SELECT public.reset_agent_action_counters(); $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

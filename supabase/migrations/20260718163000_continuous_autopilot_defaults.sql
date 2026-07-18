-- Autopilot monitors continuously on an hourly server schedule. Defaults allow
-- more than a five-job batch while retaining visible daily/monthly safety caps.
ALTER TABLE public.user_job_prefs
  ALTER COLUMN daily_apply_cap SET DEFAULT 10,
  ALTER COLUMN agent_max_actions_per_day SET DEFAULT 60;

UPDATE public.user_job_prefs
SET agent_max_actions_per_day = 60
WHERE agent_max_actions_per_day = 20;

-- Apply engine credits, rate limits, and idempotency.
-- 1 successful portal submit = 1 credit. System-side failures do not consume.
-- Stripe promotion codes discount price, never the monthly bucket.

CREATE TABLE IF NOT EXISTS public.apply_engine_limits (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL CHECK (value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.apply_engine_limits (key, value) VALUES
  ('per_user_max_running', 12),
  ('global_max_running', 120),
  ('per_user_daily_enqueue', 60),
  ('per_ats_per_user_hourly', 8),
  ('max_batch', 60)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.apply_engine_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read apply engine limits" ON public.apply_engine_limits;
CREATE POLICY "Authenticated read apply engine limits"
  ON public.apply_engine_limits FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.apply_engine_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_engine_limit(p_key TEXT, p_default INTEGER)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT value FROM public.apply_engine_limits WHERE key = p_key), p_default);
$$;

ALTER TABLE public.applypass_tasks
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS applypass_tasks_active_idempotency_uidx
  ON public.applypass_tasks (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND status IN ('pending', 'running');

CREATE UNIQUE INDEX IF NOT EXISTS applypass_tasks_one_active_engine_eval
  ON public.applypass_tasks (user_id, ((payload ->> 'evaluation_id')))
  WHERE task_type = 'apply_engine'
    AND status IN ('pending', 'running')
    AND payload ? 'evaluation_id';

CREATE UNIQUE INDEX IF NOT EXISTS application_receipts_one_per_task
  ON public.application_receipts (applypass_task_id)
  WHERE applypass_task_id IS NOT NULL;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS promotion_code TEXT,
  ADD COLUMN IF NOT EXISTS discount_percent INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.apply_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('grant_period', 'consume_submit', 'refund_system_failure', 'adjust')),
  applypass_task_id UUID REFERENCES public.applypass_tasks(id) ON DELETE SET NULL,
  draft_application_id UUID REFERENCES public.draft_applications(id) ON DELETE SET NULL,
  receipt_id UUID REFERENCES public.application_receipts(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT apply_credit_ledger_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_apply_credit_ledger_user_period
  ON public.apply_credit_ledger (user_id, period_start, created_at DESC);

ALTER TABLE public.apply_credit_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own apply credits" ON public.apply_credit_ledger;
CREATE POLICY "Users read own apply credits"
  ON public.apply_credit_ledger FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.apply_credit_ledger FROM anon, authenticated;
GRANT SELECT ON public.apply_credit_ledger TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_credit_plan_bucket(p_plan TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(COALESCE(p_plan, 'free'))
    WHEN 'starter' THEN 30
    WHEN 'pro' THEN 80
    WHEN 'autopilot' THEN 250
    WHEN 'premium' THEN 250
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.apply_credit_plan_daily_cap(p_plan TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(COALESCE(p_plan, 'free'))
    WHEN 'starter' THEN 10
    WHEN 'pro' THEN 20
    WHEN 'autopilot' THEN 40
    WHEN 'premium' THEN 40
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_apply_credit_grant(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plan_name TEXT;
  bucket INTEGER;
  period DATE := (date_trunc('month', now() AT TIME ZONE 'UTC'))::date;
BEGIN
  SELECT lower(COALESCE(subscription_plan, 'free'))
    INTO plan_name
  FROM public.user_access_controls
  WHERE user_id = p_user_id;

  plan_name := COALESCE(plan_name, 'free');
  bucket := public.apply_credit_plan_bucket(plan_name);
  IF bucket <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.apply_credit_ledger (
    user_id, period_start, delta, reason, idempotency_key, metadata
  ) VALUES (
    p_user_id,
    period,
    bucket,
    'grant_period',
    'grant:' || p_user_id::text || ':' || period::text,
    jsonb_build_object('plan', plan_name)
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- Mid-period upgrade tops up to the new bucket. Promo discounts never change this.
  INSERT INTO public.apply_credit_ledger (
    user_id, period_start, delta, reason, idempotency_key, metadata
  )
  SELECT
    p_user_id,
    period,
    bucket - COALESCE(SUM(CASE WHEN reason IN ('grant_period', 'adjust') AND delta > 0 THEN delta ELSE 0 END), 0),
    'adjust',
    'grant-topup:' || p_user_id::text || ':' || period::text || ':' || plan_name || ':' || bucket::text,
    jsonb_build_object('plan', plan_name, 'reason', 'plan_upgrade')
  FROM public.apply_credit_ledger
  WHERE user_id = p_user_id AND period_start = period
  HAVING bucket > COALESCE(SUM(CASE WHEN reason IN ('grant_period', 'adjust') AND delta > 0 THEN delta ELSE 0 END), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_apply_credit_snapshot(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := COALESCE(p_user_id, auth.uid());
  period DATE := (date_trunc('month', now() AT TIME ZONE 'UTC'))::date;
  day_start TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  hour_start TIMESTAMPTZ := now() - interval '1 hour';
  plan_name TEXT := 'free';
  granted INTEGER := 0;
  consumed INTEGER := 0;
  refunded INTEGER := 0;
  reserved INTEGER := 0;
  daily_used INTEGER := 0;
  daily_cap INTEGER := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> uid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT lower(COALESCE(subscription_plan, 'free')) INTO plan_name
  FROM public.user_access_controls WHERE user_id = uid;
  plan_name := COALESCE(plan_name, 'free');
  IF plan_name = 'premium' THEN plan_name := 'autopilot'; END IF;

  PERFORM public.ensure_apply_credit_grant(uid);

  SELECT
    COALESCE(SUM(CASE WHEN reason = 'grant_period' AND delta > 0 THEN delta ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN reason = 'consume_submit' AND delta < 0 THEN -delta ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN reason = 'refund_system_failure' AND delta > 0 THEN delta ELSE 0 END), 0)
  INTO granted, consumed, refunded
  FROM public.apply_credit_ledger
  WHERE user_id = uid AND period_start = period;

  SELECT COUNT(*) INTO reserved
  FROM public.applypass_tasks
  WHERE user_id = uid
    AND task_type = 'apply_engine'
    AND status IN ('pending', 'running')
    AND COALESCE((payload ->> 'submittable')::boolean, false) = true;

  SELECT COUNT(*) INTO daily_used
  FROM public.applypass_tasks
  WHERE user_id = uid
    AND task_type = 'apply_engine'
    AND created_at >= day_start
    AND status <> 'canceled'
    AND COALESCE((payload ->> 'submittable')::boolean, false) = true;

  daily_cap := public.apply_credit_plan_daily_cap(plan_name);

  RETURN jsonb_build_object(
    'plan', plan_name,
    'period_start', period,
    'granted', granted,
    'consumed', consumed,
    'refunded', refunded,
    'reserved', reserved,
    'remaining', GREATEST(0, granted + refunded - consumed - reserved),
    'daily_cap', daily_cap,
    'daily_used', daily_used,
    'daily_remaining', GREATEST(0, daily_cap - daily_used),
    'limits', jsonb_build_object(
      'per_user_max_running', public.apply_engine_limit('per_user_max_running', 12),
      'global_max_running', public.apply_engine_limit('global_max_running', 120),
      'per_user_daily_enqueue', public.apply_engine_limit('per_user_daily_enqueue', 60),
      'per_ats_per_user_hourly', public.apply_engine_limit('per_ats_per_user_hourly', 8),
      'max_batch', public.apply_engine_limit('max_batch', 60)
    ),
    'hour_start', hour_start
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_apply_credit(
  p_user_id UUID,
  p_task_id UUID,
  p_draft_id UUID,
  p_receipt_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  period DATE := (date_trunc('month', now() AT TIME ZONE 'UTC'))::date;
BEGIN
  IF p_user_id IS NULL OR p_task_id IS NULL THEN
    RETURN false;
  END IF;
  INSERT INTO public.apply_credit_ledger (
    user_id, period_start, delta, reason,
    applypass_task_id, draft_application_id, receipt_id,
    idempotency_key, metadata
  ) VALUES (
    p_user_id, period, -1, 'consume_submit',
    p_task_id, p_draft_id, p_receipt_id,
    'consume:' || p_task_id::text,
    jsonb_build_object('submitted', true)
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_apply_credit(
  p_user_id UUID,
  p_task_id UUID,
  p_reason TEXT DEFAULT 'system_failure'
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  period DATE := (date_trunc('month', now() AT TIME ZONE 'UTC'))::date;
  consumed BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.apply_credit_ledger
    WHERE idempotency_key = 'consume:' || p_task_id::text
  ) INTO consumed;
  IF NOT consumed THEN
    RETURN false;
  END IF;
  INSERT INTO public.apply_credit_ledger (
    user_id, period_start, delta, reason, applypass_task_id, idempotency_key, metadata
  ) VALUES (
    p_user_id, period, 1, 'refund_system_failure', p_task_id,
    'refund:' || p_task_id::text,
    jsonb_build_object('reason', COALESCE(p_reason, 'system_failure'))
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_apply_credit_snapshot(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_engine_limit(TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_apply_credit_grant(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_apply_credit(UUID, UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_apply_credit(UUID, UUID, TEXT) TO service_role;

-- Live-submit queue claims respect per-user and global running caps.
CREATE OR REPLACE FUNCTION public.claim_applypass_task(p_worker_id TEXT)
RETURNS SETOF public.applypass_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed public.applypass_tasks;
  per_user_max INTEGER := public.apply_engine_limit('per_user_max_running', 12);
  global_max INTEGER := public.apply_engine_limit('global_max_running', 120);
  global_running INTEGER;
BEGIN
  SELECT COUNT(*) INTO global_running
  FROM public.applypass_tasks
  WHERE status = 'running';
  IF global_running >= global_max THEN
    RETURN;
  END IF;

  WITH candidate AS (
    SELECT t.id
    FROM public.applypass_tasks t
    WHERE t.status = 'pending'
      AND t.attempt_count < t.max_attempts
      AND (
        SELECT COUNT(*) FROM public.applypass_tasks r
        WHERE r.user_id = t.user_id AND r.status = 'running'
      ) < per_user_max
    ORDER BY t.created_at ASC
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

-- Apply-engine tasks are gated by credits + daily/ATS caps at enqueue.
-- Do not apply the old 400/week 1600/month fake allowance to them.
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
  IF NEW.status = 'canceled' OR NEW.task_type = 'apply_engine' THEN
    RETURN NEW;
  END IF;

  IF NEW.task_type <> 'career_ops_submit'
     AND jsonb_typeof(COALESCE(NEW.payload->'jobs', '[]'::jsonb)) = 'array' THEN
    requested_units := GREATEST(1, jsonb_array_length(NEW.payload->'jobs'));
  END IF;

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
    AND status <> 'canceled'
    AND task_type <> 'apply_engine';

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
    AND status <> 'canceled'
    AND task_type <> 'apply_engine';

  IF weekly_used + requested_units > 400 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Weekly application allowance reached (400).';
  END IF;

  IF monthly_used + requested_units > 1600 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Monthly application allowance reached (1600).';
  END IF;

  RETURN NEW;
END;
$$;

-- Product analytics event stream for website visits and user activity tracking.

CREATE TABLE IF NOT EXISTS public.product_analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  path TEXT,
  referrer TEXT,
  source TEXT NOT NULL DEFAULT 'web',
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_analytics_events_occurred
  ON public.product_analytics_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_analytics_events_event_name
  ON public.product_analytics_events (event_name);

CREATE INDEX IF NOT EXISTS idx_product_analytics_events_user
  ON public.product_analytics_events (user_id);

CREATE INDEX IF NOT EXISTS idx_product_analytics_events_session
  ON public.product_analytics_events (session_id);

CREATE INDEX IF NOT EXISTS idx_product_analytics_events_path
  ON public.product_analytics_events (path);

ALTER TABLE public.product_analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Insert analytics events (anon and authenticated)" ON public.product_analytics_events;
CREATE POLICY "Insert analytics events (anon and authenticated)"
  ON public.product_analytics_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own analytics events" ON public.product_analytics_events;
CREATE POLICY "Users can view their own analytics events"
  ON public.product_analytics_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all analytics events" ON public.product_analytics_events;
CREATE POLICY "Admins can view all analytics events"
  ON public.product_analytics_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

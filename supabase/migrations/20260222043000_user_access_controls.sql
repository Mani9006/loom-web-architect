-- Account access controls and purchase state tracking for owner admin portal actions.
-- Enables block/unblock, AI access toggles, and plan/purchase visibility per user.

CREATE TABLE IF NOT EXISTS public.user_access_controls (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'suspended', 'blocked')),
  purchase_state TEXT NOT NULL DEFAULT 'trial'
    CHECK (purchase_state IN ('trial', 'active', 'past_due', 'canceled', 'manual')),
  subscription_plan TEXT NOT NULL DEFAULT 'free',
  ai_features_enabled BOOLEAN NOT NULL DEFAULT true,
  blocked_reason TEXT,
  blocked_until TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_admin_action_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_admin_action_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_access_controls_status
  ON public.user_access_controls (account_status, purchase_state);

CREATE INDEX IF NOT EXISTS idx_user_access_controls_updated_at
  ON public.user_access_controls (updated_at DESC);

ALTER TABLE public.user_access_controls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own access controls" ON public.user_access_controls;
CREATE POLICY "Users can view own access controls"
  ON public.user_access_controls
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all access controls" ON public.user_access_controls;
CREATE POLICY "Admins can view all access controls"
  ON public.user_access_controls
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage access controls" ON public.user_access_controls;
CREATE POLICY "Admins can manage access controls"
  ON public.user_access_controls
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_user_access_controls_updated_at ON public.user_access_controls;
CREATE TRIGGER update_user_access_controls_updated_at
  BEFORE UPDATE ON public.user_access_controls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill existing users.
INSERT INTO public.user_access_controls (user_id)
SELECT u.id
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- Auto-create defaults for newly registered users.
CREATE OR REPLACE FUNCTION public.handle_new_user_access_control()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_access_controls (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_access_control ON auth.users;
CREATE TRIGGER on_auth_user_created_access_control
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_access_control();

-- ApplyPass Agent Queue
-- Stores user-submitted auto-apply tasks for async agent execution.

CREATE TABLE IF NOT EXISTS public.applypass_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL DEFAULT 'bulk_apply',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'canceled')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applypass_tasks_user_created
  ON public.applypass_tasks (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_applypass_tasks_status
  ON public.applypass_tasks (status);

ALTER TABLE public.applypass_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create their own applypass tasks" ON public.applypass_tasks;
CREATE POLICY "Users can create their own applypass tasks"
  ON public.applypass_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own applypass tasks" ON public.applypass_tasks;
CREATE POLICY "Users can view their own applypass tasks"
  ON public.applypass_tasks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own applypass tasks" ON public.applypass_tasks;
CREATE POLICY "Users can update their own applypass tasks"
  ON public.applypass_tasks
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all applypass tasks" ON public.applypass_tasks;
CREATE POLICY "Admins can view all applypass tasks"
  ON public.applypass_tasks
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_applypass_tasks_updated_at ON public.applypass_tasks;
CREATE TRIGGER update_applypass_tasks_updated_at
  BEFORE UPDATE ON public.applypass_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

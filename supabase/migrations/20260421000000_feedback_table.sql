-- User feedback submissions. RLS-bound so users can only see their own.
CREATE TABLE IF NOT EXISTS public.feedback_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  category TEXT NOT NULL CHECK (category IN ('bug', 'feature', 'praise', 'other')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  page_url TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'in_progress', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON public.feedback_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON public.feedback_submissions (user_id);

ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users create own feedback" ON public.feedback_submissions;
CREATE POLICY "Users create own feedback"
  ON public.feedback_submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users read own feedback" ON public.feedback_submissions;
CREATE POLICY "Users read own feedback"
  ON public.feedback_submissions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read all feedback" ON public.feedback_submissions;
CREATE POLICY "Admins read all feedback"
  ON public.feedback_submissions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update feedback" ON public.feedback_submissions;
CREATE POLICY "Admins update feedback"
  ON public.feedback_submissions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

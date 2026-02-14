
-- Create tracked_jobs table for Job Tracker persistence
CREATE TABLE public.tracked_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Saved',
  url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tracked_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own tracked jobs"
  ON public.tracked_jobs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tracked jobs"
  ON public.tracked_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tracked jobs"
  ON public.tracked_jobs FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tracked jobs"
  ON public.tracked_jobs FOR DELETE USING (auth.uid() = user_id);

-- Auto-update timestamp trigger
CREATE TRIGGER update_tracked_jobs_updated_at
  BEFORE UPDATE ON public.tracked_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster user queries
CREATE INDEX idx_tracked_jobs_user_id ON public.tracked_jobs(user_id);
CREATE INDEX idx_tracked_jobs_status ON public.tracked_jobs(user_id, status);

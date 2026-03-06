-- KAN-12: Apply Jobs Feature - Database Schema (Milestone 0)
-- Creates tables for one-click job applications, history tracking, and campaign management

-- Applications table: stores individual job applications
CREATE TABLE public.applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  company TEXT NOT NULL,
  job_board TEXT NOT NULL,
  application_url TEXT,
  resume_id UUID REFERENCES public.user_documents(id) ON DELETE SET NULL,
  cover_letter_id UUID REFERENCES public.user_documents(id) ON DELETE SET NULL,
  ats_score INTEGER DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'failed', 'withdrawn')),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, job_board, job_id)
);

-- Application history table: tracks status changes over time
CREATE TABLE public.application_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  status_before TEXT,
  status_after TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

-- Apply campaigns table: tracks batch job application campaigns
CREATE TABLE public.apply_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  job_count INTEGER NOT NULL DEFAULT 0,
  applied_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX idx_applications_user_id ON public.applications(user_id);
CREATE INDEX idx_applications_status ON public.applications(status);
CREATE INDEX idx_applications_applied_at ON public.applications(applied_at);
CREATE INDEX idx_applications_user_job_board ON public.applications(user_id, job_board);
CREATE INDEX idx_application_history_application_id ON public.application_history(application_id);
CREATE INDEX idx_apply_campaigns_user_id ON public.apply_campaigns(user_id);

-- Enable Row Level Security
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apply_campaigns ENABLE ROW LEVEL SECURITY;

-- RLS Policies for applications
CREATE POLICY "Users can view their own applications" ON public.applications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own applications" ON public.applications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own applications" ON public.applications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own applications" ON public.applications
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for application_history (read-only)
CREATE POLICY "Users can view history of their applications" ON public.application_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.applications
      WHERE id = application_history.application_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Application history auto-created on status change" ON public.application_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.applications
      WHERE id = application_history.application_id
      AND user_id = auth.uid()
    )
  );

-- RLS Policies for apply_campaigns
CREATE POLICY "Users can view their own campaigns" ON public.apply_campaigns
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own campaigns" ON public.apply_campaigns
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own campaigns" ON public.apply_campaigns
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own campaigns" ON public.apply_campaigns
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger to auto-update updated_at on applications
CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to auto-update updated_at on apply_campaigns
CREATE TRIGGER update_apply_campaigns_updated_at
  BEFORE UPDATE ON public.apply_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to create history entry when application status changes
CREATE OR REPLACE FUNCTION public.create_application_history()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status != OLD.status THEN
    INSERT INTO public.application_history (application_id, status_before, status_after)
    VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER application_status_change_history
  AFTER UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.create_application_history();

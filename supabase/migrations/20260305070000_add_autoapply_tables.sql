-- New tables for AutoApply & Job Discovery features
-- Migration: 2026-03-05

-- Jobs table: stores scraped/fetched job listings
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  description TEXT,
  apply_url TEXT,
  source TEXT DEFAULT 'jsearch',
  date_posted TIMESTAMPTZ,
  salary_min INTEGER,
  salary_max INTEGER,
  job_type TEXT, -- fulltime, parttime, contract, internship
  remote BOOLEAN DEFAULT FALSE,
  employer_logo TEXT,
  external_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job applications table: tracks every application
CREATE TABLE IF NOT EXISTS public.job_applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  status TEXT DEFAULT 'applied' CHECK (status IN ('applied', 'confirmed', 'interviewing', 'offer', 'rejected', 'withdrawn')),
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  apply_url TEXT,
  notes TEXT,
  confirmation_email_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email aliases table: for application tracking
CREATE TABLE IF NOT EXISTS public.email_aliases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alias_email TEXT NOT NULL UNIQUE,
  forwarding_email TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Application emails table: parsed confirmation emails
CREATE TABLE IF NOT EXISTS public.application_emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_application_id UUID REFERENCES public.job_applications(id) ON DELETE SET NULL,
  from_email TEXT,
  subject TEXT,
  body_preview TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  parsed_status TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_source ON public.jobs(source);
CREATE INDEX IF NOT EXISTS idx_jobs_date_posted ON public.jobs(date_posted DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_external_id ON public.jobs(external_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_user ON public.job_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_status ON public.job_applications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_email_aliases_user ON public.email_aliases(user_id);

-- Enable RLS
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_emails ENABLE ROW LEVEL SECURITY;

-- RLS Policies: jobs are readable by all authenticated users
CREATE POLICY "Jobs are viewable by authenticated users" ON public.jobs
  FOR SELECT TO authenticated USING (true);

-- RLS Policies: user can only see their own applications
CREATE POLICY "Users can view own applications" ON public.job_applications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own applications" ON public.job_applications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own applications" ON public.job_applications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- RLS Policies: user can only see their own email aliases
CREATE POLICY "Users can manage own aliases" ON public.email_aliases
  FOR ALL TO authenticated USING (auth.uid() = user_id);

-- RLS Policies: user can only see their own application emails
CREATE POLICY "Users can view own emails" ON public.application_emails
  FOR ALL TO authenticated USING (auth.uid() = user_id);

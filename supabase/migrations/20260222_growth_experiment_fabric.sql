-- Growth Experiment Fabric: Database Schema
-- Tables for experiment definitions, variant assignments, and funnel event tracking
-- Tied to Supabase + Vercel analytics instrumentation plan

-- experiments: one row per A/B test or feature flag experiment
CREATE TABLE public.experiments (
  id           TEXT PRIMARY KEY,                         -- e.g. 'landing-cta-v1'
  name         TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'running', 'paused', 'concluded')),
  variants     JSONB NOT NULL DEFAULT '["control","treatment"]',
  traffic_pct  INTEGER NOT NULL DEFAULT 100              -- % of eligible users enrolled
                CHECK (traffic_pct BETWEEN 1 AND 100),
  started_at   TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- experiment_assignments: deterministic per-user variant bucket
CREATE TABLE public.experiment_assignments (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  variant       TEXT NOT NULL,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(experiment_id, user_id)
);

CREATE INDEX idx_exp_assignments_experiment ON public.experiment_assignments(experiment_id);
CREATE INDEX idx_exp_assignments_user ON public.experiment_assignments(user_id);

-- experiment_events: funnel events tagged with experiment context
CREATE TABLE public.experiment_events (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  variant       TEXT NOT NULL,
  event_name    TEXT NOT NULL,  -- e.g. 'signup', 'onboarding_complete', 'upgrade_click', 'paid_convert'
  properties    JSONB NOT NULL DEFAULT '{}',
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_exp_events_experiment ON public.experiment_events(experiment_id);
CREATE INDEX idx_exp_events_user ON public.experiment_events(user_id);
CREATE INDEX idx_exp_events_name ON public.experiment_events(event_name);
CREATE INDEX idx_exp_events_occurred ON public.experiment_events(occurred_at);

-- RLS
ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_events ENABLE ROW LEVEL SECURITY;

-- experiments: readable by all authenticated users (definitions are not secret)
CREATE POLICY "Experiments readable by authenticated users" ON public.experiments
  FOR SELECT TO authenticated USING (true);

-- experiment_assignments: users see only their own assignment
CREATE POLICY "Users read own experiment assignments" ON public.experiment_assignments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own experiment assignments" ON public.experiment_assignments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- experiment_events: users insert their own events; no read policy needed client-side
CREATE POLICY "Users insert own experiment events" ON public.experiment_events
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- auto-update updated_at on experiments
-- Note: public.update_updated_at_column() is defined in migration
--       20260125023907_1bcdd4a2-d858-4c6c-be73-b8ec4358a72b.sql
CREATE TRIGGER update_experiments_updated_at
  BEFORE UPDATE ON public.experiments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial experiment definitions for the 30-day sprint
INSERT INTO public.experiments (id, name, description, status, variants, traffic_pct, started_at) VALUES
  ('landing-cta-v1',
   'Landing Page CTA Copy',
   'Test "Free ATS Score Check" vs "Get Started Free" as primary CTA on landing page',
   'running',
   '["control","treatment"]',
   100,
   now()),

  ('onboarding-progress-bar-v1',
   'Onboarding Progress Bar',
   'Show a 4-step progress bar during onboarding vs current linear flow',
   'running',
   '["control","treatment"]',
   100,
   now()),

  ('ats-score-gate-v1',
   'ATS Score Fix Gate',
   'Gate AI fix suggestions behind upgrade for scores < 70 vs showing freely',
   'draft',
   '["control","treatment"]',
   50,
   NULL),

  ('upgrade-modal-annual-v1',
   'Upgrade Modal Annual Billing Nudge',
   'Show 30% annual discount prominently in upgrade modal vs default monthly',
   'draft',
   '["control","treatment"]',
   100,
   NULL),

  ('social-proof-landing-v1',
   'Social Proof on Landing',
   'Add testimonials with specific ATS score improvements vs current landing',
   'draft',
   '["control","treatment"]',
   100,
   NULL);

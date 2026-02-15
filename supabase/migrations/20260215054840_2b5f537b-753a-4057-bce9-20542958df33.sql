
-- Add onboarding_completed flag to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Add target_role and job_preferences columns for onboarding data
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS target_role text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS job_preferences jsonb DEFAULT '{}'::jsonb;

-- Add resume_json column to profiles for persistent resume storage
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS resume_json JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.resume_json IS 'Stores the user resume data as structured JSON for the Resume Builder';

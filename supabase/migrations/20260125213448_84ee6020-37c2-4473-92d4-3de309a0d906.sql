-- Create a table for cover letter versions
CREATE TABLE public.cover_letter_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cover_letter_id UUID NOT NULL REFERENCES public.cover_letters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.cover_letter_versions ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own cover letter versions" 
ON public.cover_letter_versions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own cover letter versions" 
ON public.cover_letter_versions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cover letter versions" 
ON public.cover_letter_versions 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_cover_letter_versions_cover_letter_id ON public.cover_letter_versions(cover_letter_id);
CREATE INDEX idx_cover_letter_versions_created_at ON public.cover_letter_versions(created_at DESC);
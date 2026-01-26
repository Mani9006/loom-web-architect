-- Add UPDATE policy for cover_letter_versions table
-- This allows users to update their own cover letter versions

CREATE POLICY "Users can update their own cover letter versions"
ON public.cover_letter_versions
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
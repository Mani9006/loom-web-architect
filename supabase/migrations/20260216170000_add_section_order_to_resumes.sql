-- Add section_order column to resumes table for custom section ordering
ALTER TABLE public.resumes
ADD COLUMN IF NOT EXISTS section_order JSONB DEFAULT NULL;

-- Comment for documentation
COMMENT ON COLUMN public.resumes.section_order IS 'JSON array of section IDs defining the display order of resume sections. When NULL, uses the default order.';

-- Resume import provenance and measurable parse quality.
--
-- The source document remains the immutable evidence record. A resume stores
-- the parser version and deterministic coverage report used to create it so a
-- low-quality extraction can never masquerade as a completed import.

ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES public.user_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_hash TEXT,
  ADD COLUMN IF NOT EXISTS parser_version TEXT,
  ADD COLUMN IF NOT EXISTS parse_quality JSONB,
  ADD COLUMN IF NOT EXISTS parsed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_resumes_source_document
  ON public.resumes (source_document_id)
  WHERE source_document_id IS NOT NULL;

ALTER TABLE public.resumes
  DROP CONSTRAINT IF EXISTS resumes_parse_quality_score_check;

ALTER TABLE public.resumes
  ADD CONSTRAINT resumes_parse_quality_score_check
  CHECK (
    parse_quality IS NULL
    OR (
      jsonb_typeof(parse_quality) = 'object'
      AND (parse_quality ->> 'score')::numeric BETWEEN 0 AND 100
    )
  );

COMMENT ON COLUMN public.resumes.source_document_id
  IS 'Immutable source evidence used for the latest resume import.';
COMMENT ON COLUMN public.resumes.source_hash
  IS 'SHA-256 of normalized extracted source text for provenance and deduplication.';
COMMENT ON COLUMN public.resumes.parser_version
  IS 'Versioned parser contract used for the import.';
COMMENT ON COLUMN public.resumes.parse_quality
  IS 'Deterministic source coverage metrics and review warnings.';


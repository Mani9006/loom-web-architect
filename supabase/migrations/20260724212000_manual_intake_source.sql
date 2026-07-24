-- User-supplied links outside a verified direct ATS remain useful for a
-- review-only application packet. Store them explicitly as `manual` rather
-- than disguising them as Lever jobs; disabled manual companies are never
-- scanned or auto-submitted.

ALTER TABLE public.scan_companies
  DROP CONSTRAINT IF EXISTS scan_companies_api_type_check;

UPDATE public.scan_companies
SET enabled = false
WHERE api_type = 'manual'
  AND enabled IS DISTINCT FROM false;

ALTER TABLE public.scan_companies
  ADD CONSTRAINT scan_companies_api_type_check
  CHECK (
    api_type IN (
      'greenhouse',
      'ashby',
      'lever',
      'workable',
      'remotive',
      'arbeitnow',
      'adzuna',
      'manual'
    )
  );

ALTER TABLE public.scan_companies
  DROP CONSTRAINT IF EXISTS scan_companies_manual_disabled_check,
  ADD CONSTRAINT scan_companies_manual_disabled_check
    CHECK (api_type <> 'manual' OR enabled = false);

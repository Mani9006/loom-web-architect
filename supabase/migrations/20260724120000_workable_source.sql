-- Workable board source for the career-ops scanner.
-- Widens the api_type check so scan_companies can register Workable boards
-- (apply.workable.com/<slug>); the fetcher uses Workable's public listing API
-- (POST /api/v3/accounts/{slug}/jobs, nextPage token pagination).

ALTER TABLE public.scan_companies
  DROP CONSTRAINT IF EXISTS scan_companies_api_type_check;
ALTER TABLE public.scan_companies
  ADD CONSTRAINT scan_companies_api_type_check
  CHECK (api_type IN ('greenhouse', 'ashby', 'lever', 'workable', 'remotive', 'arbeitnow', 'adzuna'));

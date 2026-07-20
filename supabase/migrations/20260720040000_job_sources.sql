-- Aggregate job-board sources feeding the career-ops scanner.
-- Widens the api_type check and registers no-key feeds (Remotive,
-- Arbeitnow) plus Adzuna (free developer key, stored as function secrets).

ALTER TABLE public.scan_companies
  DROP CONSTRAINT IF EXISTS scan_companies_api_type_check;
ALTER TABLE public.scan_companies
  ADD CONSTRAINT scan_companies_api_type_check
  CHECK (api_type IN ('greenhouse', 'ashby', 'lever', 'remotive', 'arbeitnow', 'adzuna'));

INSERT INTO public.scan_companies
  (slug, name, api_type, api_identifier, careers_url, category, enabled)
VALUES
  ('remotive',  'Remotive',  'remotive',  'software-dev', 'https://remotive.com',          'Aggregator', true),
  ('arbeitnow', 'Arbeitnow', 'arbeitnow', 'all',          'https://www.arbeitnow.com',     'Aggregator', true),
  ('adzuna',    'Adzuna',    'adzuna',    'us',           'https://www.adzuna.com',        'Aggregator', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  api_type = EXCLUDED.api_type,
  api_identifier = EXCLUDED.api_identifier,
  careers_url = EXCLUDED.careers_url,
  category = EXCLUDED.category,
  last_scan_error = NULL,
  updated_at = now();

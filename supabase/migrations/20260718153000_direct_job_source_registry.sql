-- Refresh the zero-model employer source registry with identifiers verified
-- against the vendors' public job-posting endpoints.

INSERT INTO public.scan_companies
  (slug, name, api_type, api_identifier, careers_url, category, enabled)
VALUES
  ('openai',      'OpenAI',      'ashby',      'openai',      'https://openai.com/careers',                        'AI Labs', true),
  ('notion',      'Notion',      'ashby',      'notion',      'https://www.notion.com/careers',                   'Productivity', true),
  ('ramp',        'Ramp',        'ashby',      'ramp',        'https://ramp.com/careers',                         'Fintech', true),
  ('linear',      'Linear',      'ashby',      'linear',      'https://linear.app/careers',                       'Productivity', true),
  ('cursor',      'Cursor',      'ashby',      'cursor',      'https://www.cursor.com/careers',                   'AI Platforms', true),
  ('databricks',  'Databricks',  'greenhouse', 'databricks',  'https://www.databricks.com/company/careers',      'Data & AI', true),
  ('stripe',      'Stripe',      'greenhouse', 'stripe',      'https://stripe.com/jobs',                          'Fintech', true),
  ('cloudflare',  'Cloudflare',  'greenhouse', 'cloudflare',  'https://www.cloudflare.com/careers',              'Cloud', true),
  ('scaleai',     'Scale AI',    'greenhouse', 'scaleai',     'https://scale.com/careers',                        'AI Platforms', true),
  ('reddit',      'Reddit',      'greenhouse', 'reddit',      'https://www.redditinc.com/careers',               'Consumer', true),
  ('affirm',      'Affirm',      'greenhouse', 'affirm',      'https://www.affirm.com/careers',                  'Fintech', true),
  ('palantir',    'Palantir',    'lever',      'palantir',    'https://www.palantir.com/careers',                'Data & AI', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  api_type = EXCLUDED.api_type,
  api_identifier = EXCLUDED.api_identifier,
  careers_url = EXCLUDED.careers_url,
  category = EXCLUDED.category,
  enabled = EXCLUDED.enabled,
  last_scan_error = NULL,
  updated_at = now();

-- These legacy identifiers no longer resolve on their configured public API.
-- Disable them until an administrator verifies a replacement instead of
-- wasting every scheduled scan on predictable 404s.
UPDATE public.scan_companies
SET enabled = false, updated_at = now()
WHERE slug IN ('mistral', 'cohere', 'hume', 'retool', 'langchain', 'pinecone', 'wandb', 'zapier');


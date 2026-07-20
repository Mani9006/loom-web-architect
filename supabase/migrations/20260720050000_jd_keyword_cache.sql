-- JD keyword cache: LLM keyword extraction is deterministic per normalized
-- job-description text, so results are cached server-side by content hash and
-- shared across users. Read-through from career-ops-ats / ats-score-v2; a hit
-- skips the LLM call entirely (token efficiency for repeat scores of the
-- same posting).
--
-- jd_hash = md5 hex of "<scope>\n<normalized JD text>" where scope separates
-- extractor payload shapes ("ats-kw" -> { jd_keywords, suggestions },
-- "jd-match" -> { required }). Cache rows contain no user data.
-- RLS service-only: edge functions use the service role; anon/authenticated
-- get nothing.

CREATE TABLE IF NOT EXISTS public.jd_keyword_cache (
  jd_hash text PRIMARY KEY,
  keywords jsonb NOT NULL,
  model text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.jd_keyword_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jd_keyword_cache FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.jd_keyword_cache TO service_role;

-- Belt-and-braces: the service role bypasses RLS, but state the intent for
-- any future grant.
DROP POLICY IF EXISTS jd_keyword_cache_service_only ON public.jd_keyword_cache;
CREATE POLICY jd_keyword_cache_service_only
  ON public.jd_keyword_cache FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Cached, source-grounded career evidence graph.
--
-- A small model reviews a resume once per source fingerprint. Matching reuses
-- this graph so adjacent-role discovery understands client history and tools
-- without paying for a language-model call for every job.

CREATE TABLE IF NOT EXISTS public.resume_career_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  source_fingerprint TEXT NOT NULL,
  graph JSONB NOT NULL,
  calculated_experience_years NUMERIC(4,1) NOT NULL DEFAULT 0,
  confirmed_experience_years NUMERIC(4,1),
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  review_version TEXT NOT NULL DEFAULT 'career-evidence-v1',
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, resume_id)
);

ALTER TABLE public.resume_career_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own career evidence" ON public.resume_career_profiles;
CREATE POLICY "Users read own career evidence"
  ON public.resume_career_profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_resume_career_profiles_user_reviewed
  ON public.resume_career_profiles (user_id, reviewed_at DESC);

ALTER TABLE public.resume_career_profiles
  DROP CONSTRAINT IF EXISTS resume_career_profiles_graph_object_check,
  ADD CONSTRAINT resume_career_profiles_graph_object_check
    CHECK (jsonb_typeof(graph) = 'object');

COMMENT ON TABLE public.resume_career_profiles IS
  'Cached AI-reviewed career graph grounded in indexed source-resume evidence.';

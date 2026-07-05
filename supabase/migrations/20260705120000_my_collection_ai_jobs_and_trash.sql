-- ============================================================================
-- My Collection — fix schema drift (ADDITIVE ONLY)
-- ============================================================================
-- The generated types (src/integrations/supabase/types.ts) already describe
-- `mc_tracked_jobs.deleted_at`, `mc_ai_jobs`, and `mc_worker_heartbeats` —
-- they exist in the live database but were never captured in a migration.
-- A fresh environment (new dev setup, CI, disaster recovery) replaying only
-- the migrations folder would end up missing all three, breaking the
-- Board/Trash soft-delete flow and the entire local-worker AI job queue.
-- This migration brings the migrations folder back in sync with reality.
-- ============================================================================

-- ── 1. Soft-delete support for kanban cards (Trash tab) ────────────────

ALTER TABLE mc_tracked_jobs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS mc_tracked_deleted_idx
  ON mc_tracked_jobs (session_id, deleted_at);

-- ── 2. AI job queue — the website enqueues here, the user's local worker
--    (running `claude -p` against their own Max plan) claims and completes
--    jobs, writing the result back. ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS mc_ai_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    uuid REFERENCES mc_sessions(id) ON DELETE CASCADE,
  kind          text NOT NULL
    CHECK (kind IN ('tailor','score_job','classify_email','company_research','rewrite_line','test','other')),
  status        text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','done','failed','canceled')),
  model         text NOT NULL DEFAULT 'haiku-4-5',
  prompt        text NOT NULL,
  input         jsonb,
  result        text,
  result_json   jsonb,
  error         text,
  attempts      integer NOT NULL DEFAULT 0,
  priority      integer NOT NULL DEFAULT 5,
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

CREATE INDEX IF NOT EXISTS mc_ai_jobs_user_status_idx
  ON mc_ai_jobs (user_id, status, priority, created_at);
CREATE INDEX IF NOT EXISTS mc_ai_jobs_session_idx
  ON mc_ai_jobs (session_id);

ALTER TABLE mc_ai_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_ai_jobs_owner_all" ON mc_ai_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Guarded: some environments already have this table in the publication
-- (added via the dashboard), and re-adding it errors instead of no-op'ing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mc_ai_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mc_ai_jobs;
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- supabase_realtime publication doesn't exist in this environment;
  -- the frontend's polling fallback still works without it.
  NULL;
END $$;

-- ── 3. Local worker heartbeats — powers the "AI ready / AI offline" badge ──

CREATE TABLE IF NOT EXISTS mc_worker_heartbeats (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hostname    text,
  version     text,
  last_seen   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_worker_heartbeats_owner_all" ON mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Done. Reverse with:
--   ALTER TABLE mc_tracked_jobs DROP COLUMN deleted_at;
--   DROP TABLE mc_worker_heartbeats, mc_ai_jobs CASCADE;
-- ============================================================================

-- ============================================================================
-- My Collection — close migration drift with production schema
-- ============================================================================
-- The frontend (src/lib/mc-ai-jobs.ts, BoardTab.tsx, DiscoverTab.tsx,
-- TrashDialog.tsx, WorkerStatusBadge.tsx) and the generated Supabase types
-- (src/integrations/supabase/types.ts) already reference:
--   - mc_tracked_jobs.deleted_at   (soft-delete / Trash dialog)
--   - mc_ai_jobs                  (local-worker AI job queue)
--   - mc_worker_heartbeats        (AI-worker online/offline badge)
--
-- None of these were ever captured in a migration file, so a fresh database
-- (new environment, CI, local dev) is missing them entirely — the whole
-- soft-delete flow and the AI tailor/discover pipeline fail with
-- "column/relation does not exist" even though production has them.
-- This migration is additive-only and safe to re-run.
-- ============================================================================

-- ── mc_tracked_jobs.deleted_at (soft delete / Trash dialog) ────────────────

ALTER TABLE public.mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS mc_tracked_deleted_idx
  ON public.mc_tracked_jobs (session_id, deleted_at);

-- ── mc_ai_jobs — local-worker AI job queue ──────────────────────────────────
-- The website never calls the AI provider directly. It inserts a row here;
-- the user's local worker (see scripts/applypass-browser-worker.mjs pattern)
-- picks up queued jobs, runs the model, and writes the result back. The
-- frontend polls/subscribes via realtime until status reaches a terminal
-- state (done | failed | canceled).

CREATE TABLE IF NOT EXISTS public.mc_ai_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  session_id    uuid REFERENCES public.mc_sessions(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  status        text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed', 'canceled')),
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
  ON public.mc_ai_jobs (user_id, status, created_at);

CREATE INDEX IF NOT EXISTS mc_ai_jobs_session_idx
  ON public.mc_ai_jobs (session_id);

ALTER TABLE public.mc_ai_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mc_ai_jobs_owner_all" ON public.mc_ai_jobs;
CREATE POLICY "mc_ai_jobs_owner_all" ON public.mc_ai_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- The frontend subscribes to UPDATE events on this table (waitForJob in
-- src/lib/mc-ai-jobs.ts) — it must be part of the realtime publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'mc_ai_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mc_ai_jobs;
  END IF;
END $$;

-- ── mc_worker_heartbeats — AI-worker online/offline badge ──────────────────
-- One row per user. The local worker upserts this every ~30s; the frontend
-- (WorkerStatusBadge) treats "online" as a heartbeat within the last 90s.

CREATE TABLE IF NOT EXISTS public.mc_worker_heartbeats (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  hostname    text,
  version     text,
  last_seen   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mc_worker_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mc_worker_heartbeats_owner_all" ON public.mc_worker_heartbeats;
CREATE POLICY "mc_worker_heartbeats_owner_all" ON public.mc_worker_heartbeats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Reverse:
--   ALTER TABLE public.mc_tracked_jobs DROP COLUMN IF EXISTS deleted_at;
--   DROP TABLE IF EXISTS public.mc_ai_jobs, public.mc_worker_heartbeats CASCADE;
-- ============================================================================

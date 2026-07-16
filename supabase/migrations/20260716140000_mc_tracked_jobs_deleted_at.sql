-- ============================================================================
-- My Collection — fix: mc_tracked_jobs is missing deleted_at
-- ============================================================================
-- The Board tab, Trash dialog, Stats tab, and session card counts all filter
-- and update mc_tracked_jobs.deleted_at (soft-delete / restore), but no
-- migration ever added the column. Every board load, trash open, and stats
-- fetch has been failing with "column mc_tracked_jobs.deleted_at does not
-- exist". This migration adds it.
-- ============================================================================

ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- The Trash dialog filters WHERE deleted_at IS NOT NULL, ordered by
-- deleted_at — not covered by the existing (session_id, status, updated_at)
-- index.
CREATE INDEX IF NOT EXISTS mc_tracked_trash_idx
  ON mc_tracked_jobs (session_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- Reverse:
--   DROP INDEX IF EXISTS mc_tracked_trash_idx;
--   ALTER TABLE mc_tracked_jobs DROP COLUMN IF EXISTS deleted_at;
-- ============================================================================

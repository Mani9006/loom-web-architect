-- ============================================================================
-- Add deleted_at to mc_tracked_jobs for soft-delete / Trash dialog support.
-- Safe to run multiple times — ALTER TABLE … ADD COLUMN IF NOT EXISTS.
-- ============================================================================

ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Speed up "WHERE deleted_at IS NULL" (active board) and
-- "WHERE deleted_at IS NOT NULL" (trash dialog) queries.
CREATE INDEX IF NOT EXISTS mc_tracked_deleted_at_idx
  ON mc_tracked_jobs (session_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

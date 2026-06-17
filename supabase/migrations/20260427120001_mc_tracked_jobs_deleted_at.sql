-- Add soft-delete support to mc_tracked_jobs.
-- The frontend uses deleted_at IS NULL to filter the active kanban board and
-- deleted_at IS NOT NULL to list the Trash dialog. Without this column the
-- soft-delete + trash restore feature is entirely non-functional.

ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Index so the "active board" filter (WHERE deleted_at IS NULL) is fast on
-- large sessions without a full table scan.
CREATE INDEX IF NOT EXISTS mc_tracked_jobs_not_deleted_idx
  ON mc_tracked_jobs (session_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

-- Add soft-delete column to mc_tracked_jobs.
-- BoardTab and TrashDialog filter on deleted_at IS NULL; this column
-- was missing from the initial migration.
ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Index so the common "not deleted" filter is fast.
CREATE INDEX IF NOT EXISTS mc_tracked_jobs_deleted_at_idx
  ON mc_tracked_jobs (session_id, deleted_at)
  WHERE deleted_at IS NULL;

-- Add soft-delete support to mc_tracked_jobs.
-- The TrashDialog queries rows WHERE deleted_at IS NOT NULL.
-- BoardTab and StatsTab filter them out with IS NULL.

ALTER TABLE mc_tracked_jobs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial index makes trash queries fast without bloating the main scan.
CREATE INDEX IF NOT EXISTS mc_tracked_deleted_idx
  ON mc_tracked_jobs (session_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

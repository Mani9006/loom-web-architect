-- Add soft-delete support to mc_tracked_jobs.
-- The column was referenced by frontend code (BoardTab, TrashDialog, DiscoverTab,
-- StatsTab, MyCollectionPage) but never included in the original migration.
-- Without this column every .is("deleted_at", null) filter returned a Supabase
-- "column does not exist" error, breaking trash/restore for all sessions.

ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS mc_tracked_deleted_idx
  ON mc_tracked_jobs (session_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

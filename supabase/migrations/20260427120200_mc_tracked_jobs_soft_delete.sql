-- ============================================================================
-- Add soft-delete support to mc_tracked_jobs.
--
-- The frontend (BoardTab, TrashDialog, StatsTab, DiscoverTab) already
-- references deleted_at for filtering active cards and showing a recoverable
-- trash list, but this column was not present in the original migration.
-- This migration is purely additive — it will not break existing data.
-- ============================================================================

ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial index: all active-card lookups filter WHERE deleted_at IS NULL, so
-- this index covers the hot path without indexing the (small) trash rows.
CREATE INDEX IF NOT EXISTS mc_tracked_soft_delete_idx
  ON mc_tracked_jobs (session_id, updated_at DESC)
  WHERE deleted_at IS NULL;

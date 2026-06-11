-- Add soft-delete column to mc_tracked_jobs.
--
-- The My Collection frontend (BoardTab, TrashDialog, DiscoverTab, StatsTab)
-- filters active cards with .is("deleted_at", null) and surfaces trashed
-- cards with .not("deleted_at", "is", null), but the original migration
-- (20260427120000_my_collection.sql) was missing this column.
--
-- This migration adds it with a NULL default (all existing rows are active)
-- and a partial index for efficient trash queries.

ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Partial index: only indexes actually-deleted rows, so trash queries
-- (WHERE deleted_at IS NOT NULL) are fast without bloating the active-card index.
CREATE INDEX IF NOT EXISTS mc_tracked_deleted_session_idx
  ON mc_tracked_jobs (session_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

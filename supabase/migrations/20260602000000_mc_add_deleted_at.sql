-- ============================================================================
-- My Collection — add soft-delete column to mc_tracked_jobs
-- ============================================================================
-- BoardTab, TrashDialog, and StatsTab all filter on `deleted_at IS NULL`
-- (active cards) or `deleted_at IS NOT NULL` (trash). The original
-- 20260427120000_my_collection.sql migration omitted this column; this
-- migration adds it without touching any other table.
-- ============================================================================

ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial index for the trash dialog: only indexes rows that are actually in
-- the trash so it stays small even when boards grow large.
CREATE INDEX IF NOT EXISTS mc_tracked_deleted_idx
  ON mc_tracked_jobs (session_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

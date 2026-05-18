-- ============================================================================
-- Add soft-delete support to mc_tracked_jobs
-- ============================================================================
-- The Board tab soft-deletes cards (sets deleted_at) so they can be restored
-- from the Trash dialog. This column was accidentally omitted from the
-- original mc_tracked_jobs migration.
-- ============================================================================

ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Index so the common `.is("deleted_at", null)` filter stays fast even as
-- the table grows. Most queries filter active cards; deleted rows are rare.
CREATE INDEX IF NOT EXISTS mc_tracked_jobs_deleted_at_idx
  ON mc_tracked_jobs (session_id, deleted_at)
  WHERE deleted_at IS NULL;

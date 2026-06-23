-- ============================================================================
-- Add soft-delete support to mc_tracked_jobs
-- ============================================================================
-- The application code references deleted_at IS NULL / IS NOT NULL in:
--   BoardTab.tsx     — filters active cards and sets deleted_at on trash
--   StatsTab.tsx     — excludes trashed cards from counts
--   TrashDialog.tsx  — lists / restores / hard-deletes trashed cards
--   MyCollectionPage — excludes trashed cards from session stats
--
-- This column was omitted from the original migration. Adding it here with
-- IF NOT EXISTS so the migration is safe to re-apply.
-- ============================================================================

ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial index — makes the .is("deleted_at", null) filter fast since
-- the vast majority of rows will never be trashed.
CREATE INDEX IF NOT EXISTS mc_tracked_jobs_not_deleted_idx
  ON mc_tracked_jobs (session_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

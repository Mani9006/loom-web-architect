-- Add soft-delete support to mc_tracked_jobs.
-- The Trash feature (TrashDialog + BoardTab) marks deleted cards with a
-- non-null deleted_at rather than hard-deleting them, allowing undo.
-- This migration was missed in the original My Collection schema.

ALTER TABLE mc_tracked_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Index so that "live" cards (deleted_at IS NULL) are cheap to filter by
-- status, and so the Trash dialog (deleted_at IS NOT NULL) can sort quickly.
CREATE INDEX IF NOT EXISTS mc_tracked_deleted_at_idx
  ON mc_tracked_jobs (session_id, deleted_at, updated_at DESC);

-- mc_status_history INSERT policy only checked that the inserted row's
-- user_id matched the caller, not that tracked_job_id actually belongs to
-- that user. Any authenticated user could insert a status-history row that
-- points tracked_job_id at another user's mc_tracked_jobs row, polluting the
-- audit trail with cross-user references (RLS on mc_tracked_jobs itself
-- still prevents them from reading/modifying the other user's job directly).
DROP POLICY IF EXISTS "mc_history_owner_insert" ON mc_status_history;
CREATE POLICY "mc_history_owner_insert" ON mc_status_history
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM mc_tracked_jobs t
      WHERE t.id = tracked_job_id AND t.user_id = auth.uid()
    )
  );

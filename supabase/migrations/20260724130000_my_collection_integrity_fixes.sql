-- ============================================================================
-- My Collection: close two integrity gaps found by audit
-- ============================================================================
-- 1. mc_tracked_jobs had no uniqueness guard. scanned_job_id is always NULL
--    in practice (no scanner ever populates it — DiscoverTab.saveToBoard and
--    AddJobManuallyDialog both insert scanned_job_id: null), so apply_url is
--    the only real per-job identity signal. Dedupe was enforced purely
--    client-side via an in-memory Set (DiscoverTab.tsx), so a page reload, a
--    double click before the toast fires, or the same session open in two
--    tabs created duplicate kanban cards for the same job — inflating
--    StatsTab counts and cluttering the board. Scoped to non-deleted rows so
--    trashing then re-adding the same job still works.
--
-- 2. ACTIVE_LIMIT = 5 (MyCollectionPage.tsx) was only a disabled-button check
--    against stale client state — nothing stopped a second tab, a second
--    device, or a stale wizard from creating/reactivating past the cap. Add
--    the same limit as a DB-level trigger so it actually holds.
-- ============================================================================

-- De-duplicate existing rows first (keep the most recently updated per
-- session+apply_url) so the unique index can be created safely.
DELETE FROM public.mc_tracked_jobs a
USING public.mc_tracked_jobs b
WHERE a.session_id = b.session_id
  AND a.apply_url = b.apply_url
  AND a.apply_url IS NOT NULL
  AND a.deleted_at IS NULL
  AND b.deleted_at IS NULL
  AND a.id <> b.id
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS mc_tracked_jobs_session_url_unique
  ON public.mc_tracked_jobs (session_id, apply_url)
  WHERE apply_url IS NOT NULL AND deleted_at IS NULL;

-- ── Active session cap, enforced server-side ────────────────────────────────

CREATE OR REPLACE FUNCTION public.mc_enforce_active_session_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count integer;
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    SELECT count(*) INTO active_count
    FROM public.mc_sessions
    WHERE user_id = NEW.user_id
      AND status = 'active'
      AND id <> NEW.id;
    IF active_count >= 5 THEN
      RAISE EXCEPTION 'Reached the active session limit (5). Archive one first.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mc_sessions_active_limit ON public.mc_sessions;
CREATE TRIGGER mc_sessions_active_limit
  BEFORE INSERT OR UPDATE ON public.mc_sessions
  FOR EACH ROW EXECUTE FUNCTION public.mc_enforce_active_session_limit();

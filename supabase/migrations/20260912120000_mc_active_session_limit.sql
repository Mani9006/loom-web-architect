-- ============================================================================
-- My Collection — enforce the 5-active-session cap server-side
-- ============================================================================
-- The frontend (MyCollectionPage, NewSessionWizard) only disables the
-- "New Session" / "Reactivate" buttons once it has already counted 5 active
-- sessions client-side. Nothing on the server stopped a second insert/update
-- that races that count (two tabs, a stale button, a retried request) from
-- pushing a user past the cap. This trigger makes the cap authoritative.
-- ============================================================================

CREATE OR REPLACE FUNCTION mc_enforce_active_session_limit() RETURNS trigger AS $$
DECLARE
  active_count integer;
BEGIN
  -- Only re-check when a row is entering (or newly created into) the
  -- 'active' status. Edits to an already-active session (renaming it,
  -- updating notes, etc.) don't need to re-count.
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    SELECT count(*) INTO active_count
    FROM mc_sessions
    WHERE user_id = NEW.user_id AND status = 'active' AND id <> NEW.id;

    IF active_count >= 5 THEN
      RAISE EXCEPTION 'You can have at most 5 active sessions. Archive one first.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mc_sessions_enforce_active_limit ON mc_sessions;
CREATE TRIGGER mc_sessions_enforce_active_limit
  BEFORE INSERT OR UPDATE ON mc_sessions
  FOR EACH ROW EXECUTE FUNCTION mc_enforce_active_session_limit();

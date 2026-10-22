-- ============================================================================
-- My Collection — enforce the 5-active-session cap server-side
-- ============================================================================
-- 20260427120000_my_collection.sql documents "Each user can have up to 5
-- active + N archived sessions" but never enforced it in the database — only
-- the UI (src/pages/MyCollection/MyCollectionPage.tsx, ACTIVE_LIMIT) disabled
-- the "New Session" button and the "Reactivate" action once at the cap. That
-- leaves the invariant bypassable from a second tab/window that hasn't
-- re-rendered yet, or any direct write against mc_sessions. This migration
-- backs the same limit with a trigger so it holds regardless of client state.
-- ============================================================================

CREATE OR REPLACE FUNCTION mc_enforce_active_session_limit() RETURNS trigger AS $$
DECLARE
  active_count integer;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  -- Only a transition INTO 'active' (a new session, or a reactivation) can
  -- push the user over the cap; a session already active being updated for
  -- an unrelated reason (name, target_profile, ...) doesn't add to the count.
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO active_count
    FROM mc_sessions
    WHERE user_id = NEW.user_id AND status = 'active' AND id <> NEW.id;

  IF active_count >= 5 THEN
    RAISE EXCEPTION 'You can have at most 5 active sessions. Archive one first.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mc_sessions_active_limit ON mc_sessions;
CREATE TRIGGER mc_sessions_active_limit
  BEFORE INSERT OR UPDATE ON mc_sessions
  FOR EACH ROW EXECUTE FUNCTION mc_enforce_active_session_limit();

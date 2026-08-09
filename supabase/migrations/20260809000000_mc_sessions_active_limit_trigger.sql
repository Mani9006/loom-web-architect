-- ============================================================================
-- My Collection — enforce the 5-active-session cap server-side
-- ============================================================================
-- mc_sessions was always documented as "up to 5 active + N archived sessions"
-- (see 20260427120000_my_collection.sql) but that limit was only ever checked
-- client-side in MyCollectionPage.tsx / NewSessionWizard.tsx. A second tab,
-- a second device, or a direct API call could create unlimited active
-- sessions. This adds the equivalent server-side guard via trigger, since a
-- CHECK constraint cannot count sibling rows.
-- ============================================================================

CREATE OR REPLACE FUNCTION mc_enforce_active_session_limit() RETURNS trigger AS $$
DECLARE
  active_count integer;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    -- Already active and staying active (e.g. a name/notes edit) — no new
    -- active session is being added, nothing to check.
    RETURN NEW;
  END IF;

  SELECT count(*) INTO active_count
  FROM mc_sessions
  WHERE user_id = NEW.user_id
    AND status = 'active'
    AND id <> NEW.id;

  IF active_count >= 5 THEN
    RAISE EXCEPTION 'active_session_limit_reached'
      USING DETAIL = 'You can have at most 5 active My Collection sessions. Archive one first.',
            ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mc_sessions_enforce_active_limit ON mc_sessions;
CREATE TRIGGER mc_sessions_enforce_active_limit
  BEFORE INSERT OR UPDATE OF status ON mc_sessions
  FOR EACH ROW
  EXECUTE FUNCTION mc_enforce_active_session_limit();

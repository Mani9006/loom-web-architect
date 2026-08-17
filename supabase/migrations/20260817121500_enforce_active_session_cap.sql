-- mc_sessions was documented ("Each user can have up to 5 active + N
-- archived sessions") but only enforced client-side (MyCollectionPage's
-- ACTIVE_LIMIT check). Two concurrent inserts/reactivations both under the
-- cap can both pass the client check and push a user over 5 active
-- sessions. Enforce the same rule at the database level as a trigger, since
-- a plain CHECK constraint cannot see other rows.
CREATE OR REPLACE FUNCTION mc_enforce_active_session_cap() RETURNS trigger AS $$
DECLARE
  active_count integer;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO active_count
  FROM mc_sessions
  WHERE user_id = NEW.user_id AND status = 'active' AND id <> NEW.id;

  IF active_count >= 5 THEN
    RAISE EXCEPTION 'You can have at most 5 active application workspaces at a time. Archive one first.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mc_sessions_enforce_active_cap ON mc_sessions;
CREATE TRIGGER mc_sessions_enforce_active_cap
  BEFORE INSERT OR UPDATE ON mc_sessions
  FOR EACH ROW EXECUTE FUNCTION mc_enforce_active_session_cap();

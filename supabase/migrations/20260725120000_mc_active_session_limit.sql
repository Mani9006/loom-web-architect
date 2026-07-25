-- ============================================================================
-- Enforce the 5-active-session cap server-side (My Collection)
-- ============================================================================
-- src/pages/MyCollection/MyCollectionPage.tsx enforces ACTIVE_LIMIT = 5 by
-- disabling the "New Session" button and the "Reactivate" action once a user
-- already has 5 active mc_sessions rows. That's a client-side convenience
-- only — nothing stops a second tab, a race between two clicks, or a direct
-- API call from inserting/reactivating past the cap, since RLS just checks
-- ownership (auth.uid() = user_id), not the count of active sessions.
--
-- This adds a BEFORE INSERT/UPDATE trigger that re-checks the same rule the
-- UI already advertises, so the limit actually holds regardless of client.
-- ============================================================================

CREATE OR REPLACE FUNCTION mc_enforce_active_session_limit() RETURNS trigger AS $$
DECLARE
  active_count integer;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    -- Already active and staying active (e.g. unrelated field edit) — no new
    -- slot is being consumed.
    RETURN NEW;
  END IF;

  SELECT count(*) INTO active_count
  FROM mc_sessions
  WHERE user_id = NEW.user_id
    AND status = 'active'
    AND id <> NEW.id;

  IF active_count >= 5 THEN
    RAISE EXCEPTION 'active session limit reached (max 5 active sessions; archive one first)'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mc_sessions_enforce_active_limit ON mc_sessions;
CREATE TRIGGER mc_sessions_enforce_active_limit
  BEFORE INSERT OR UPDATE ON mc_sessions
  FOR EACH ROW EXECUTE FUNCTION mc_enforce_active_session_limit();

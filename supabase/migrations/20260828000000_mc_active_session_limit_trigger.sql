-- ============================================================================
-- My Collection — enforce the active-session cap server-side
-- ============================================================================
-- 20260427120000_my_collection.sql documents "Each user can have up to 5
-- active + N archived sessions" but never actually enforces it in the
-- database, only the frontend does (src/pages/MyCollection/MyCollectionPage.tsx
-- disables the "New Session" button once activeSessions.length >= 5). That
-- leaves a real gap: two browser tabs, a stale client, or a direct API call
-- can race past the check and create more than 5 active sessions per user.
-- This migration makes the limit authoritative in Postgres.
-- ============================================================================

CREATE OR REPLACE FUNCTION mc_enforce_active_session_limit() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    IF (
      SELECT count(*) FROM mc_sessions
      WHERE user_id = NEW.user_id AND status = 'active' AND id <> NEW.id
    ) >= 5 THEN
      RAISE EXCEPTION 'Active session limit reached (max 5). Archive a session first.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mc_sessions_active_limit ON mc_sessions;
CREATE TRIGGER mc_sessions_active_limit
  BEFORE INSERT OR UPDATE ON mc_sessions
  FOR EACH ROW EXECUTE FUNCTION mc_enforce_active_session_limit();

-- ============================================================================
-- Reverse:
--   DROP TRIGGER mc_sessions_active_limit ON mc_sessions;
--   DROP FUNCTION mc_enforce_active_session_limit();
-- ============================================================================

-- ============================================================================
-- Enforce the "at most 5 active My Collection sessions per user" rule at the
-- database level.
--
-- Previously this was only enforced by disabling the "New Session" button in
-- MyCollectionPage.tsx once activeSessions.length >= 5. That check used a
-- `sessions` state array that starts empty until loadSessions() resolves, and
-- NewSessionWizard's createSession() never re-checked the count before
-- inserting. Two open tabs, or a request racing the initial load, could both
-- create sessions past the cap. This trigger makes the cap authoritative
-- regardless of client state.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mc_enforce_active_session_cap() RETURNS trigger AS $$
DECLARE
  active_count integer;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO active_count
  FROM public.mc_sessions
  WHERE user_id = NEW.user_id
    AND status = 'active'
    AND id <> NEW.id;

  IF active_count >= 5 THEN
    RAISE EXCEPTION 'mc_sessions active limit reached: at most 5 active sessions per user';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mc_sessions_enforce_active_cap ON public.mc_sessions;
CREATE TRIGGER mc_sessions_enforce_active_cap
  BEFORE INSERT OR UPDATE ON public.mc_sessions
  FOR EACH ROW EXECUTE FUNCTION public.mc_enforce_active_session_cap();

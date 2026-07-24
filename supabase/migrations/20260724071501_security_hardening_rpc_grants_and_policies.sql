-- Historical DEV migration recovered from the live Supabase migration ledger.
-- This file preserves source/remote history; later security-boundary
-- migrations further restrict the same functions and policies.

REVOKE EXECUTE ON FUNCTION public.claim_applypass_task(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.append_applypass_task_log(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_ai_usage(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reap_stale_applypass_tasks() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_agent_action_counters() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.auto_assign_admin_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_access_control() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_welcome_email() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_continuous_apply_caps() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mc_touch_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_app_incident(text, text, text, text, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.write_audit_log(uuid, text, text, text, uuid, jsonb, text, text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_actor_id uuid,
  p_action text,
  p_resource text DEFAULT NULL,
  p_resource_id text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_actor uuid;
BEGIN
  v_actor := COALESCE(auth.uid(), p_actor_id);
  INSERT INTO public.audit_log_entries
    (actor_id, action, resource, resource_id, tenant_id, metadata, ip_address, user_agent)
  VALUES
    (v_actor, p_action, p_resource, p_resource_id, p_tenant_id, p_metadata, p_ip_address, p_user_agent)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

ALTER FUNCTION public.send_welcome_email() SET search_path = '';
ALTER FUNCTION public.mc_touch_updated_at() SET search_path = '';

DROP POLICY IF EXISTS "Service can insert jobs" ON public.jobs;

CREATE POLICY "Anyone can read cached jobs" ON public.cached_jobs
  FOR SELECT TO authenticated USING (true);

-- Security hardening from the 2026-10-01 audit. Only REVOKEs and policy
-- drops; no data changes. Idempotent and safe on databases where some of
-- these objects were created outside migrations (or do not exist).
--
-- 1. SECURITY DEFINER functions run with owner privileges, and Postgres
--    grants EXECUTE to PUBLIC by default, so PostgREST exposes them at
--    /rest/v1/rpc/<name> to anyone holding the public anon key.
--    grant_credits / consume_application_credit / refund_application_credit
--    take an arbitrary p_user_id with no caller check, which let anyone
--    mint or drain any user's credits. Every legitimate caller uses the
--    service role, so restrict them to it.
-- 2. applypass_tasks INSERT/UPDATE policies let users write queue rows
--    directly, bypassing the entitlement and monthly-cap checks done in
--    applypass-agent-queue / career-ops-submit, and letting a user flip a
--    finished task back to pending. All writes now go through those edge
--    functions with the service role; users keep SELECT on their own rows.

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.grant_credits(uuid, integer, text, jsonb)',
    'public.consume_application_credit(uuid, uuid)',
    'public.refund_application_credit(uuid, uuid)',
    'public.ensure_credit_balance()',
    'public.write_audit_log(uuid, text, text, text, uuid, jsonb, text, text)',
    'public.claim_applypass_task(text)',
    'public.append_applypass_task_log(uuid, jsonb)',
    'public.increment_ai_usage(uuid, text, integer, integer)',
    'public.reset_agent_action_counters()',
    'public.reap_stale_applypass_tasks()'
  ]
  LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "Users can create their own applypass tasks" ON public.applypass_tasks;
DROP POLICY IF EXISTS "Users can update their own applypass tasks" ON public.applypass_tasks;

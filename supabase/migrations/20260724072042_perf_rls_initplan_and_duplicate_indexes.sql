-- Historical DEV migration recovered from the live Supabase migration ledger.

DO $$
DECLARE
  r record;
  new_qual text;
  new_check text;
  cmd text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    new_qual := r.qual;
    new_check := r.with_check;
    IF new_qual IS NOT NULL THEN
      new_qual := replace(new_qual, '( SELECT auth.uid() AS uid)', '__WRAPPED_UID__');
      new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
      new_qual := replace(new_qual, '__WRAPPED_UID__', '( SELECT auth.uid() AS uid)');
    END IF;
    IF new_check IS NOT NULL THEN
      new_check := replace(new_check, '( SELECT auth.uid() AS uid)', '__WRAPPED_UID__');
      new_check := replace(new_check, 'auth.uid()', '(select auth.uid())');
      new_check := replace(new_check, '__WRAPPED_UID__', '( SELECT auth.uid() AS uid)');
    END IF;
    IF COALESCE(new_qual, '') <> COALESCE(r.qual, '')
       OR COALESCE(new_check, '') <> COALESCE(r.with_check, '') THEN
      cmd := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
      IF new_qual IS NOT NULL AND COALESCE(new_qual,'') <> COALESCE(r.qual,'') THEN
        cmd := cmd || format(' USING (%s)', new_qual);
      END IF;
      IF new_check IS NOT NULL AND COALESCE(new_check,'') <> COALESCE(r.with_check,'') THEN
        cmd := cmd || format(' WITH CHECK (%s)', new_check);
      END IF;
      EXECUTE cmd;
    END IF;
  END LOOP;
END
$$;

DROP INDEX IF EXISTS public.idx_cached_jobs_expires;
DROP INDEX IF EXISTS public.mc_ai_jobs_user_idx;
DROP INDEX IF EXISTS public.saved_jobs_user_idx;
DROP INDEX IF EXISTS public.subscription_plans_user_idx;

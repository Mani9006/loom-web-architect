-- US-only agent workspace: search recipes, dedicated apply-from mailbox,
-- Workday vault (service-role only), standing instructions.

ALTER TABLE public.user_job_prefs
  ADD COLUMN IF NOT EXISTS standing_instructions TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cover_letter_auto BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS review_ats_pause BOOLEAN NOT NULL DEFAULT true;

UPDATE public.user_job_prefs
SET target_countries = ARRAY['United States']
WHERE target_countries IS NULL OR cardinality(target_countries) = 0;

CREATE TABLE IF NOT EXISTS public.search_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  target_roles TEXT[] NOT NULL DEFAULT '{}',
  locations TEXT[] NOT NULL DEFAULT ARRAY['United States'],
  min_fit_score INTEGER NOT NULL DEFAULT 82 CHECK (min_fit_score BETWEEN 50 AND 100),
  exclude_keywords TEXT[] NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS search_recipes_user_idx ON public.search_recipes (user_id, sort_order, created_at);

ALTER TABLE public.search_recipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own search recipes" ON public.search_recipes;
CREATE POLICY "Users manage own search recipes"
  ON public.search_recipes FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.apply_mailboxes (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  local_part TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL DEFAULT 'apply.resumepreps.com',
  address TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.apply_mailboxes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own apply mailbox" ON public.apply_mailboxes;
CREATE POLICY "Users read own apply mailbox"
  ON public.apply_mailboxes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.apply_mailboxes FROM anon, authenticated;
GRANT SELECT ON public.apply_mailboxes TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_apply_mailbox(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := COALESCE(p_user_id, auth.uid());
  domain TEXT := 'apply.resumepreps.com';
  local TEXT;
  addr TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> uid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT address INTO addr FROM public.apply_mailboxes WHERE user_id = uid;
  IF addr IS NOT NULL THEN
    RETURN jsonb_build_object('address', addr, 'domain', domain);
  END IF;

  local := 'rp' || substr(replace(uid::text, '-', ''), 1, 10);
  addr := local || '@' || domain;
  INSERT INTO public.apply_mailboxes (user_id, local_part, domain, address)
  VALUES (uid, local, domain, addr)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT address, apply_mailboxes.domain INTO addr, domain
  FROM public.apply_mailboxes WHERE user_id = uid;

  RETURN jsonb_build_object('address', addr, 'domain', domain);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_apply_mailbox(UUID) TO authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS app_private;

CREATE TABLE IF NOT EXISTS app_private.ats_login_secrets (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ats TEXT NOT NULL,
  username TEXT,
  secret TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ats)
);

REVOKE ALL ON app_private.ats_login_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON app_private.ats_login_secrets TO service_role;

CREATE OR REPLACE FUNCTION public.ats_vault_status(p_ats TEXT DEFAULT 'workday')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  uid UUID := auth.uid();
  row_username TEXT;
  has_secret BOOLEAN := false;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT username, secret IS NOT NULL AND length(secret) > 0
    INTO row_username, has_secret
  FROM app_private.ats_login_secrets
  WHERE user_id = uid AND ats = lower(COALESCE(p_ats, 'workday'));
  RETURN jsonb_build_object(
    'ats', lower(COALESCE(p_ats, 'workday')),
    'configured', COALESCE(has_secret, false),
    'username', row_username
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ats_vault_upsert(p_ats TEXT, p_username TEXT, p_secret TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_secret IS NULL OR length(trim(p_secret)) < 4 THEN
    RAISE EXCEPTION 'secret too short';
  END IF;
  INSERT INTO app_private.ats_login_secrets (user_id, ats, username, secret, updated_at)
  VALUES (uid, lower(COALESCE(p_ats, 'workday')), nullif(trim(p_username), ''), trim(p_secret), now())
  ON CONFLICT (user_id, ats) DO UPDATE
    SET username = EXCLUDED.username,
        secret = EXCLUDED.secret,
        updated_at = now();
  RETURN jsonb_build_object('ok', true, 'configured', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.ats_vault_clear(p_ats TEXT DEFAULT 'workday')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  DELETE FROM app_private.ats_login_secrets
  WHERE user_id = uid AND ats = lower(COALESCE(p_ats, 'workday'));
  RETURN jsonb_build_object('ok', true, 'configured', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ats_vault_status(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ats_vault_upsert(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ats_vault_clear(TEXT) TO authenticated;

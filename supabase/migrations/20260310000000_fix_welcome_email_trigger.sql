-- Fix send_welcome_email trigger: wrong schema (extensions vs net) and wrong param order
-- This was causing ALL email verifications and Google OAuth callbacks to return 500
-- with error: "function extensions.http_post(url=>text,headers=>jsonb,body=>jsonb) does not exist"
CREATE OR REPLACE FUNCTION public.send_welcome_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_name TEXT;
  payload   JSONB;
  project_url TEXT;
  service_key TEXT;
BEGIN
  -- Only fire when email_confirmed_at changes from NULL to a value (first confirmation)
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN

    user_name := COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    );

    payload := jsonb_build_object(
      'type', 'welcome',
      'to',   NEW.email,
      'data', jsonb_build_object('name', user_name)
    );

    SELECT decrypted_secret
    INTO project_url
    FROM vault.decrypted_secrets
    WHERE name IN ('project_url', 'supabase_url')
    ORDER BY CASE name WHEN 'project_url' THEN 0 ELSE 1 END
    LIMIT 1;

    SELECT decrypted_secret
    INTO service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    project_url := rtrim(project_url, '/');

    -- Fail closed when this environment has not provisioned its own internal
    -- endpoint credentials. A staging migration must never call production.
    IF project_url IS NULL OR service_key IS NULL THEN
      RAISE WARNING
        'send_welcome_email skipped: add Vault secrets project_url and service_role_key';
      RETURN NEW;
    END IF;

    IF project_url !~ '^https://[a-z0-9]{20}\.supabase\.co$' THEN
      RAISE WARNING 'send_welcome_email skipped: invalid project_url';
      RETURN NEW;
    END IF;

    -- Use net.http_post (correct schema) with exception handling so any
    -- delivery failure never blocks the auth transaction.
    BEGIN
      PERFORM net.http_post(
        url     := project_url || '/functions/v1/send-email',
        body    := payload,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || service_key
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log but never fail — welcome email must not block sign-up
      RAISE WARNING 'send_welcome_email: http_post failed: %', SQLERRM;
    END;

  END IF;

  RETURN NEW;
END;
$$;

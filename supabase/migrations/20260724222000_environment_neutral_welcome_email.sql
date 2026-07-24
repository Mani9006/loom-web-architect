-- Re-apply the environment-neutral welcome-email trigger definition to
-- databases that already recorded 20260310000000 before it was hardened.
CREATE OR REPLACE FUNCTION public.send_welcome_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  user_name text;
  payload jsonb;
  project_url text;
  service_key text;
BEGIN
  IF OLD.email_confirmed_at IS NOT NULL OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  payload := jsonb_build_object(
    'type', 'welcome',
    'to', NEW.email,
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

  IF project_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING
      'send_welcome_email skipped: add Vault secrets project_url and service_role_key';
    RETURN NEW;
  END IF;

  IF project_url !~ '^https://[a-z0-9]{20}\.supabase\.co$' THEN
    RAISE WARNING 'send_welcome_email skipped: invalid project_url';
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := project_url || '/functions/v1/send-email',
      body := payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'send_welcome_email: http_post failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.send_welcome_email() FROM PUBLIC;

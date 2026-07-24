-- Historical migration recovered from the DEV ledger. It must also remain safe
-- if a new staging or production database has not recorded this version.
--
-- Never embed a project ref in a portable migration. Operators may provision
-- `project_url` (preferred) or `supabase_url` plus `service_role_key` in Vault.
-- If either value is absent, the migration fails closed and leaves the
-- environment's existing cron configuration unchanged.
DO $migration$
DECLARE
  project_url text;
  service_key text;
BEGIN
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
      'Cron endpoint migration skipped: add Vault secrets project_url and service_role_key';
    RETURN;
  END IF;

  IF project_url !~ '^https://[a-z0-9]{20}\.supabase\.co$' THEN
    RAISE EXCEPTION 'Refusing untrusted Supabase project_url';
  END IF;

  PERFORM cron.alter_job(1, command := format($command$
DO $body$
DECLARE key text;
BEGIN
  SELECT decrypted_secret INTO key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;
  IF key IS NULL THEN
    RAISE WARNING 'pg_cron career-ops-scan skipped: add Vault secret service_role_key';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := %L,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || key),
    body := jsonb_build_object('source','pg_cron')
  );
END
$body$;
$command$, project_url || '/functions/v1/career-ops-scan'));

  PERFORM cron.alter_job(4, command := format($command$
DO $body$
DECLARE key text;
BEGIN
  SELECT decrypted_secret INTO key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;
  IF key IS NULL THEN
    RAISE WARNING 'pg_cron agents-orchestrator skipped: add Vault secret service_role_key';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := %L,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || key),
    body := jsonb_build_object('source','pg_cron_continuous')
  );
END
$body$;
$command$, project_url || '/functions/v1/agents-orchestrator'));

  PERFORM cron.alter_job(6, command := format($command$
DO $body$
DECLARE key text;
BEGIN
  SELECT decrypted_secret INTO key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;
  IF key IS NULL THEN
    RAISE WARNING 'pg_cron mc-gmail-poll skipped: add Vault secret service_role_key';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := %L,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || key),
    body := jsonb_build_object('source','pg_cron')
  );
END
$body$;
$command$, project_url || '/functions/v1/mc-gmail-poll'));
END
$migration$;

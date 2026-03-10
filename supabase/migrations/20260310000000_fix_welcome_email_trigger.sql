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

    -- Use net.http_post (correct schema) with exception handler so any
    -- failure here NEVER blocks the auth transaction.
    BEGIN
      PERFORM net.http_post(
        url     := 'https://woxtbyotydxorcdhhivr.supabase.co/functions/v1/send-email',
        body    := payload,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndveHRieW90eWR4b3JjZGhoaXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzODY2NjksImV4cCI6MjA4Njk2MjY2OX0.jUt8F8lRVSDf2kxOuX1bVZwcmlcUw8NnfrZonj6aV-g'
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

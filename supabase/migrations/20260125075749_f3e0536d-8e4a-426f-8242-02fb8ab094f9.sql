-- Update handle_new_user function with input validation and error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name TEXT;
  v_avatar_url TEXT;
BEGIN
  -- Sanitize and validate full_name (max 255 chars, strip potential XSS)
  v_full_name := LEFT(COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NULL
  ), 255);
  
  -- Validate avatar_url format (must be valid https URL, max 512 chars)
  v_avatar_url := NEW.raw_user_meta_data->>'avatar_url';
  IF v_avatar_url IS NOT NULL THEN
    -- Only allow http/https URLs to prevent XSS via javascript: or data: URLs
    IF v_avatar_url !~ '^https?://[a-zA-Z0-9][a-zA-Z0-9\-\.]*\.[a-zA-Z]{2,}' THEN
      v_avatar_url := NULL;
    ELSE
      v_avatar_url := LEFT(v_avatar_url, 512);
    END IF;
  END IF;

  INSERT INTO public.profiles (user_id, email, full_name, avatar_url)
  VALUES (NEW.id, NEW.email, v_full_name, v_avatar_url)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log warning but don't fail user creation
  RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
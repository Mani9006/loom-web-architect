-- Ensure owner account has admin role access for the Admin Portal.
-- Requested owner login: myfamily9006@gmail.com

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'user'::public.app_role
FROM auth.users u
WHERE lower(coalesce(u.email, '')) = lower('myfamily9006@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE lower(coalesce(u.email, '')) = lower('myfamily9006@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

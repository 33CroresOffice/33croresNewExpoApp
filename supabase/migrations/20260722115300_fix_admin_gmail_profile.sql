-- Create admin profile for admin@gmail.com auth user
-- This user was created (likely via phone auth) but has no profile row,
-- causing "Account not found" on admin login.

INSERT INTO public.profiles (id, mobile, full_name, role, admin_role, is_verified, notification_sms, notification_whatsapp, notification_module_access)
VALUES (
  'c8186f8e-07e9-4715-a597-cc8766e93a02',
  '0000000099',
  'Admin',
  'admin',
  'super_admin',
  true,
  false,
  false,
  true
)
ON CONFLICT (id) DO UPDATE SET
  role = 'admin',
  admin_role = 'super_admin',
  full_name = COALESCE(profiles.full_name, 'Admin');

-- Set the JWT app_metadata role to admin and admin_role to super_admin
-- so RLS policies and frontend checks recognise this user as admin
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data ||
  jsonb_build_object(
    'role', 'admin',
    'admin_role', 'super_admin',
    'modules', '["orders","procurement","catalog","finance","crm","riders","notifications","admin_users","roles","logs","panji"]'::jsonb
  )
WHERE id = 'c8186f8e-07e9-4715-a597-cc8766e93a02';

/*
  # Create Admin, Vendor, and Rider seed users

  Creates auth users and matching profile rows for:
  - admin@33crores.com  (role: admin, admin_role: super_admin)
  - vendor@33crores.com (role: vendor)
  - rider@33crores.com  (role: rider)

  Uses DO block to avoid errors if users already exist.
*/

DO $$
DECLARE
  admin_id  uuid;
  vendor_id uuid;
  rider_id  uuid;
BEGIN

  -- Admin user
  SELECT id INTO admin_id FROM auth.users WHERE email = 'admin@33crores.com';
  IF admin_id IS NULL THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'admin@33crores.com',
      crypt('QWEQAZ', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"],"role":"admin"}',
      '{}',
      now(), now(), '', '', '', ''
    )
    RETURNING id INTO admin_id;
  END IF;

  INSERT INTO public.profiles (id, mobile, full_name, role, admin_role, is_verified, notification_sms, notification_whatsapp, email)
  VALUES (admin_id, '0000000001', '33 Crores Admin', 'admin', 'super_admin', true, false, false, 'admin@33crores.com')
  ON CONFLICT (id) DO UPDATE SET role = 'admin', admin_role = 'super_admin', full_name = '33 Crores Admin';

  -- Vendor user
  SELECT id INTO vendor_id FROM auth.users WHERE email = 'vendor@33crores.com';
  IF vendor_id IS NULL THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'vendor@33crores.com',
      crypt('Vendor@33crores', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      now(), now(), '', '', '', ''
    )
    RETURNING id INTO vendor_id;
  END IF;

  INSERT INTO public.profiles (id, mobile, full_name, role, is_verified, notification_sms, notification_whatsapp, email)
  VALUES (vendor_id, '0000000002', 'Demo Vendor', 'vendor', true, false, false, 'vendor@33crores.com')
  ON CONFLICT (id) DO UPDATE SET role = 'vendor', full_name = 'Demo Vendor';

  -- Rider user
  SELECT id INTO rider_id FROM auth.users WHERE email = 'rider@33crores.com';
  IF rider_id IS NULL THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'rider@33crores.com',
      crypt('Rider@33crores', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      now(), now(), '', '', '', ''
    )
    RETURNING id INTO rider_id;
  END IF;

  INSERT INTO public.profiles (id, mobile, full_name, role, is_verified, notification_sms, notification_whatsapp, email)
  VALUES (rider_id, '0000000003', 'Demo Rider', 'rider', true, false, false, 'rider@33crores.com')
  ON CONFLICT (id) DO UPDATE SET role = 'rider', full_name = 'Demo Rider';

END $$;

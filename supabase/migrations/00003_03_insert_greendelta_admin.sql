DO $$
DECLARE
  new_admin_id UUID := gen_random_uuid();
BEGIN
  -- Insert Admin
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@greendelta.com') THEN
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data)
    VALUES (new_admin_id, '00000000-0000-0000-0000-000000000000', 'admin@greendelta.com', crypt('Admin@123', gen_salt('bf')), now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{}');
  ELSE
    SELECT id INTO new_admin_id FROM auth.users WHERE email = 'admin@greendelta.com';
    UPDATE auth.users SET encrypted_password = crypt('Admin@123', gen_salt('bf')) WHERE id = new_admin_id;
  END IF;

  -- Insert into public.users
  INSERT INTO public.users (id, role, full_name)
  VALUES 
  (new_admin_id, 'manager', 'مدير النظام (Admin)')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;

END $$;
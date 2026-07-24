-- Explicitly drop and recreate policies to ensure WITH CHECK is present
DROP POLICY IF EXISTS "Manager can do all on buildings" ON buildings;
CREATE POLICY "Manager can do all on buildings" ON buildings
  FOR ALL USING (get_user_role() = 'manager') WITH CHECK (get_user_role() = 'manager');

DROP POLICY IF EXISTS "Manager can do all on elevators" ON elevators;
CREATE POLICY "Manager can do all on elevators" ON elevators
  FOR ALL USING (get_user_role() = 'manager') WITH CHECK (get_user_role() = 'manager');

DROP POLICY IF EXISTS "Manager can do all on technicians" ON technicians;
CREATE POLICY "Manager can do all on technicians" ON technicians
  FOR ALL USING (get_user_role() = 'manager') WITH CHECK (get_user_role() = 'manager');

DROP POLICY IF EXISTS "Manager can do all on faults" ON faults;
CREATE POLICY "Manager can do all on faults" ON faults
  FOR ALL USING (get_user_role() = 'manager') WITH CHECK (get_user_role() = 'manager');

DROP POLICY IF EXISTS "Manager can do all on maintenance" ON maintenance;
CREATE POLICY "Manager can do all on maintenance" ON maintenance
  FOR ALL USING (get_user_role() = 'manager') WITH CHECK (get_user_role() = 'manager');

DROP POLICY IF EXISTS "Manager can do all on inventory" ON inventory;
CREATE POLICY "Manager can do all on inventory" ON inventory
  FOR ALL USING (get_user_role() = 'manager') WITH CHECK (get_user_role() = 'manager');

-- Seed Users
DO $$
DECLARE
  manager_id UUID := gen_random_uuid();
  tech_id UUID := gen_random_uuid();
  acc_id UUID := gen_random_uuid();
BEGIN
  -- Ensure pgcrypto is available
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  -- Insert Manager
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'manager@example.com') THEN
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data)
    VALUES (manager_id, '00000000-0000-0000-0000-000000000000', 'manager@example.com', crypt('123456', gen_salt('bf')), now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{}');
  ELSE
    SELECT id INTO manager_id FROM auth.users WHERE email = 'manager@example.com';
  END IF;

  -- Insert Technician
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'tech@example.com') THEN
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data)
    VALUES (tech_id, '00000000-0000-0000-0000-000000000000', 'tech@example.com', crypt('123456', gen_salt('bf')), now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{}');
  ELSE
    SELECT id INTO tech_id FROM auth.users WHERE email = 'tech@example.com';
  END IF;

  -- Insert Accountant
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'accountant@example.com') THEN
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data)
    VALUES (acc_id, '00000000-0000-0000-0000-000000000000', 'accountant@example.com', crypt('123456', gen_salt('bf')), now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{}');
  ELSE
    SELECT id INTO acc_id FROM auth.users WHERE email = 'accountant@example.com';
  END IF;

  -- Insert into public.users
  INSERT INTO public.users (id, role, full_name)
  VALUES 
  (manager_id, 'manager', 'مدير النظام'),
  (tech_id, 'technician', 'فني الصيانة'),
  (acc_id, 'accountant', 'المحاسب')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;
  
  -- Insert into technicians if not exists
  IF NOT EXISTS (SELECT 1 FROM public.technicians WHERE user_id = tech_id) THEN
    INSERT INTO public.technicians (user_id, name, phone, specialization, status)
    VALUES (tech_id, 'فني الصيانة', '0500000000', 'عام', 'متاح');
  END IF;

END $$;
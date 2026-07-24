CREATE TYPE user_role AS ENUM ('manager', 'technician', 'accountant');
CREATE TYPE elevator_status AS ENUM ('نشط', 'معطل', 'قيد الصيانة');
CREATE TYPE technician_status AS ENUM ('متاح', 'مشغول', 'إجازة');
CREATE TYPE fault_priority AS ENUM ('عالية', 'متوسطة', 'منخفضة');
CREATE TYPE fault_status AS ENUM ('مفتوح', 'قيد المعالجة', 'مغلق');
CREATE TYPE maintenance_type AS ENUM ('دورية', 'طارئة');

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'technician',
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  owner TEXT NOT NULL,
  phone TEXT NOT NULL,
  elevator_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE elevators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT NOT NULL,
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  capacity TEXT NOT NULL,
  installation_year INTEGER NOT NULL,
  last_maintenance DATE,
  status elevator_status NOT NULL DEFAULT 'نشط',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE technicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  specialization TEXT NOT NULL,
  status technician_status NOT NULL DEFAULT 'متاح',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE faults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number TEXT NOT NULL UNIQUE,
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  elevator_id UUID NOT NULL REFERENCES elevators(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  priority fault_priority NOT NULL DEFAULT 'متوسطة',
  technician_id UUID REFERENCES technicians(id) ON DELETE SET NULL,
  status fault_status NOT NULL DEFAULT 'مفتوح',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type maintenance_type NOT NULL DEFAULT 'دورية',
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  elevator_id UUID NOT NULL REFERENCES elevators(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  purchase_price NUMERIC NOT NULL DEFAULT 0,
  sale_price NUMERIC NOT NULL DEFAULT 0,
  supplier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Setup
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE elevators ENABLE ROW LEVEL SECURITY;
ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE faults ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

-- Helper Functions
CREATE OR REPLACE FUNCTION get_user_role() RETURNS user_role AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Users policies
CREATE POLICY "Users can read their own data or manager can read all" ON users
  FOR SELECT USING (auth.uid() = id OR get_user_role() = 'manager');
CREATE POLICY "Manager can insert users" ON users FOR INSERT WITH CHECK (get_user_role() = 'manager');
CREATE POLICY "Manager can update users" ON users FOR UPDATE USING (get_user_role() = 'manager');
CREATE POLICY "Manager can delete users" ON users FOR DELETE USING (get_user_role() = 'manager');

-- Customers policies
CREATE POLICY "Manager and accountant can read customers" ON customers
  FOR SELECT USING (get_user_role() IN ('manager', 'accountant'));
CREATE POLICY "Manager can insert customers" ON customers FOR INSERT WITH CHECK (get_user_role() = 'manager');
CREATE POLICY "Manager can update customers" ON customers FOR UPDATE USING (get_user_role() = 'manager');
CREATE POLICY "Manager can delete customers" ON customers FOR DELETE USING (get_user_role() = 'manager');

-- Buildings policies
CREATE POLICY "Manager can do all on buildings" ON buildings
  FOR ALL USING (get_user_role() = 'manager');
CREATE POLICY "Technicians can read buildings" ON buildings
  FOR SELECT USING (get_user_role() = 'technician');

-- Elevators policies
CREATE POLICY "Manager can do all on elevators" ON elevators
  FOR ALL USING (get_user_role() = 'manager');
CREATE POLICY "Technicians can read elevators" ON elevators
  FOR SELECT USING (get_user_role() = 'technician');

-- Technicians policies
CREATE POLICY "Manager can do all on technicians" ON technicians
  FOR ALL USING (get_user_role() = 'manager');
CREATE POLICY "Technicians can read technicians" ON technicians
  FOR SELECT USING (get_user_role() = 'technician');

-- Faults policies
CREATE POLICY "Manager can do all on faults" ON faults
  FOR ALL USING (get_user_role() = 'manager');
CREATE POLICY "Technician can read assigned faults" ON faults
  FOR SELECT USING (get_user_role() = 'technician' AND technician_id IN (SELECT id FROM technicians WHERE user_id = auth.uid()));
CREATE POLICY "Technician can update assigned faults" ON faults
  FOR UPDATE USING (get_user_role() = 'technician' AND technician_id IN (SELECT id FROM technicians WHERE user_id = auth.uid()));

-- Maintenance policies
CREATE POLICY "Manager can do all on maintenance" ON maintenance
  FOR ALL USING (get_user_role() = 'manager');
CREATE POLICY "Technician can read assigned maintenance" ON maintenance
  FOR SELECT USING (get_user_role() = 'technician' AND technician_id IN (SELECT id FROM technicians WHERE user_id = auth.uid()));
CREATE POLICY "Technician can update assigned maintenance" ON maintenance
  FOR UPDATE USING (get_user_role() = 'technician' AND technician_id IN (SELECT id FROM technicians WHERE user_id = auth.uid()));

-- Inventory policies
CREATE POLICY "Manager and accountant can read inventory" ON inventory
  FOR SELECT USING (get_user_role() IN ('manager', 'accountant'));
CREATE POLICY "Manager can do all on inventory" ON inventory
  FOR ALL USING (get_user_role() = 'manager');

-- Trigger to update elevator status automatically
CREATE OR REPLACE FUNCTION update_elevator_status() RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'faults' THEN
    IF NEW.status = 'مفتوح' OR NEW.status = 'قيد المعالجة' THEN
      UPDATE elevators SET status = 'معطل' WHERE id = NEW.elevator_id;
    ELSIF NEW.status = 'مغلق' THEN
      UPDATE elevators SET status = 'نشط' WHERE id = NEW.elevator_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'maintenance' THEN
    -- If there's a maintenance record today
    IF NEW.visit_date = CURRENT_DATE THEN
      UPDATE elevators SET status = 'قيد الصيانة' WHERE id = NEW.elevator_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER fault_status_trigger
AFTER INSERT OR UPDATE OF status ON faults
FOR EACH ROW EXECUTE FUNCTION update_elevator_status();

CREATE TRIGGER maintenance_status_trigger
AFTER INSERT OR UPDATE OF visit_date ON maintenance
FOR EACH ROW EXECUTE FUNCTION update_elevator_status();

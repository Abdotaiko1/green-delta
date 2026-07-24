ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS google_maps_link TEXT;

CREATE TABLE IF NOT EXISTS public.oil_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID REFERENCES public.buildings(id) ON DELETE CASCADE,
    elevator_id UUID REFERENCES public.elevators(id) ON DELETE CASCADE,
    oil_type TEXT NOT NULL,
    oil_brand TEXT NOT NULL,
    oil_viscosity TEXT NOT NULL,
    oil_quantity NUMERIC NOT NULL,
    purchase_date DATE NOT NULL,
    change_date DATE NOT NULL,
    next_change_date DATE NOT NULL,
    cost NUMERIC NOT NULL,
    technician_id UUID REFERENCES public.technicians(id) ON DELETE SET NULL,
    supplier_name TEXT NOT NULL,
    invoice_number TEXT,
    image_url TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.oil_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager can do all on oil_records" ON public.oil_records
  FOR ALL USING (get_user_role() = 'manager') WITH CHECK (get_user_role() = 'manager');
  
CREATE POLICY "Technician can do all on oil_records" ON public.oil_records
  FOR ALL USING (get_user_role() = 'technician') WITH CHECK (get_user_role() = 'technician');
  
CREATE POLICY "Accountant can read oil_records" ON public.oil_records
  FOR SELECT USING (get_user_role() = 'accountant');

-- Storage Bucket for images
INSERT INTO storage.buckets (id, name, public) VALUES ('oil_images', 'oil_images', true) ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'oil_images');

DROP POLICY IF EXISTS "Auth Insert" ON storage.objects;
CREATE POLICY "Auth Insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'oil_images' AND auth.role() = 'authenticated');

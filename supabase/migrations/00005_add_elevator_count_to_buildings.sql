-- إضافة عمود elevator_count لجدول buildings (لقواعد بيانات قديمة بدون العمود)
ALTER TABLE public.buildings
  ADD COLUMN IF NOT EXISTS elevator_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.buildings.elevator_count IS 'عدد المصاعد في المبنى';

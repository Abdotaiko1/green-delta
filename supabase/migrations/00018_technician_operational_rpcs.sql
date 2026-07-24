-- Safe technician operations that validate assignments and bypass fragile INSERT RLS.

create or replace function public.technician_record_oil(
  p_building_id uuid,
  p_elevator_id uuid,
  p_oil_type text,
  p_oil_brand text,
  p_oil_quantity numeric,
  p_change_date date,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_record_id uuid;
begin
  if public.current_app_role() <> 'technician' or public.current_technician_id() is null then
    raise exception 'حساب تسجيل الدخول غير مربوط بفني';
  end if;
  if not public.technician_has_building(p_building_id) then
    raise exception 'الفني غير مكلف بهذا المبنى أو المصعد';
  end if;
  if p_elevator_id is not null and not exists (
    select 1 from public.elevators
    where id = p_elevator_id and building_id = p_building_id
  ) then
    raise exception 'المصعد لا يتبع المبنى المختار';
  end if;
  if length(trim(coalesce(p_oil_type, ''))) = 0 or length(trim(coalesce(p_oil_brand, ''))) = 0 then
    raise exception 'نوع الزيت والماركة مطلوبان';
  end if;

  insert into public.oil_records (
    building_id, elevator_id, oil_type, oil_brand, oil_quantity,
    change_date, next_change_date, notes
  ) values (
    p_building_id, p_elevator_id, trim(p_oil_type), trim(p_oil_brand),
    greatest(coalesce(p_oil_quantity, 0), 0), p_change_date,
    (p_change_date + interval '6 months')::date, nullif(trim(coalesce(p_notes, '')), '')
  ) returning id into new_record_id;

  return new_record_id;
end;
$$;

create or replace function public.technician_complete_maintenance(
  p_elevator_id uuid,
  p_visit_date date,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_elevator public.elevators%rowtype;
  technician_record_id uuid;
  new_maintenance_id uuid;
begin
  technician_record_id := public.current_technician_id();
  if public.current_app_role() <> 'technician' or technician_record_id is null then
    raise exception 'حساب تسجيل الدخول غير مربوط بفني';
  end if;

  select * into target_elevator from public.elevators where id = p_elevator_id;
  if target_elevator.id is null then
    raise exception 'المصعد غير موجود';
  end if;
  if not public.technician_has_building(target_elevator.building_id) then
    raise exception 'الفني غير مكلف بهذا المبنى أو المصعد';
  end if;

  insert into public.maintenance (
    type, building_id, elevator_id, visit_date, technician_id,
    notes, status, price, completed_at
  ) values (
    'دورية', target_elevator.building_id, target_elevator.id, p_visit_date,
    technician_record_id, nullif(trim(coalesce(p_notes, '')), ''), 'تمت',
    coalesce(target_elevator.maintenance_price, 0), now()
  ) returning id into new_maintenance_id;

  return new_maintenance_id;
end;
$$;

revoke all on function public.technician_record_oil(uuid, uuid, text, text, numeric, date, text) from public, anon;
grant execute on function public.technician_record_oil(uuid, uuid, text, text, numeric, date, text) to authenticated;
revoke all on function public.technician_complete_maintenance(uuid, date, text) from public, anon;
grant execute on function public.technician_complete_maintenance(uuid, date, text) to authenticated;

-- Oil inspections can be recorded by technicians for any building, with a price.

alter table public.oil_records
  add column if not exists price numeric not null default 0,
  add column if not exists recorded_by uuid references auth.users(id) on delete set null default auth.uid();

alter table public.oil_records drop constraint if exists oil_records_price_check;
alter table public.oil_records add constraint oil_records_price_check check (price >= 0);

create or replace function public.technician_oil_building_options()
returns table (id uuid, name text)
language sql stable security definer set search_path = public
as $$
  select building.id, building.name
  from public.buildings as building
  where public.current_app_role() = 'technician'
  order by building.name;
$$;

create or replace function public.technician_oil_elevator_options()
returns table (id uuid, building_id uuid, elevator_number integer, elevator_name text)
language sql stable security definer set search_path = public
as $$
  select elevator.id, elevator.building_id, elevator.elevator_number, elevator.elevator_name
  from public.elevators as elevator
  where public.current_app_role() = 'technician'
  order by elevator.elevator_number;
$$;

revoke all on function public.technician_oil_building_options() from public, anon;
grant execute on function public.technician_oil_building_options() to authenticated;
revoke all on function public.technician_oil_elevator_options() from public, anon;
grant execute on function public.technician_oil_elevator_options() to authenticated;

drop function if exists public.technician_record_oil(uuid, uuid, text, text, numeric, date, text);
drop function if exists public.technician_record_oil(uuid, uuid, text, text, numeric, numeric, date, text);

create function public.technician_record_oil(
  p_building_id uuid,
  p_elevator_id uuid,
  p_oil_type text,
  p_oil_brand text,
  p_oil_quantity numeric,
  p_price numeric,
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
  if not exists (select 1 from public.buildings where id = p_building_id) then
    raise exception 'المبنى غير موجود';
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
    building_id, elevator_id, oil_type, oil_brand, oil_quantity, price,
    change_date, next_change_date, notes, recorded_by
  ) values (
    p_building_id, p_elevator_id, trim(p_oil_type), trim(p_oil_brand),
    greatest(coalesce(p_oil_quantity, 0), 0), greatest(coalesce(p_price, 0), 0),
    p_change_date, (p_change_date + interval '6 months')::date,
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  ) returning id into new_record_id;

  return new_record_id;
end;
$$;

revoke all on function public.technician_record_oil(uuid, uuid, text, text, numeric, numeric, date, text) from public, anon;
grant execute on function public.technician_record_oil(uuid, uuid, text, text, numeric, numeric, date, text) to authenticated;

drop policy if exists "role oil technician read" on public.oil_records;
create policy "role oil technician read"
on public.oil_records for select to authenticated
using (
  public.current_app_role() = 'technician'
  and (
    public.technician_has_building(building_id)
    or recorded_by = auth.uid()
  )
);

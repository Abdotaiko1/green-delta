-- Allow historical oil changes to keep price/cost for reference without
-- creating any finance ledger entries.

begin;

alter table public.oil_records
  add column if not exists exclude_from_finance boolean not null default false;

create or replace function public.sync_oil_finance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.elevator_financial_entries
    where source_type = 'oil' and source_id = old.id;
    return old;
  end if;

  delete from public.elevator_financial_entries
  where source_type = 'oil' and source_id = new.id;

  if coalesce(new.exclude_from_finance, false) then
    return new;
  end if;

  if coalesce(new.price, 0) > 0 then
    insert into public.elevator_financial_entries(
      elevator_id, building_id, entry_date, entry_type, category,
      description, amount, source_type, source_id, created_by
    )
    values(
      new.elevator_id, new.building_id, new.change_date, 'إيراد', 'تغيير زيت',
      'قيمة تغيير الزيت للعميل', new.price, 'oil', new.id, new.recorded_by
    );
  end if;

  if coalesce(new.cost_amount, 0) > 0 then
    insert into public.elevator_financial_entries(
      elevator_id, building_id, entry_date, entry_type, category,
      description, amount, source_type, source_id, created_by
    )
    values(
      new.elevator_id, new.building_id, new.change_date, 'مصروف', 'تكلفة زيت',
      'تكلفة الزيت المستخدمة', new.cost_amount, 'oil', new.id, new.recorded_by
    );
  end if;

  return new;
end;
$$;

drop trigger if exists oil_sync_finance on public.oil_records;
create trigger oil_sync_finance
after insert or update or delete on public.oil_records
for each row execute function public.sync_oil_finance();

drop function if exists public.technician_record_oil(
  uuid, uuid, text, text, numeric, numeric, numeric, date, text
);

create function public.technician_record_oil(
  p_building_id uuid,
  p_elevator_id uuid,
  p_oil_type text,
  p_oil_brand text,
  p_oil_quantity numeric,
  p_price numeric,
  p_cost_amount numeric,
  p_change_date date,
  p_notes text,
  p_exclude_from_finance boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_record_id uuid;
begin
  if not public.has_app_permission('oil', 'create') then
    raise exception 'غير مسموح بإضافة تغيير زيت';
  end if;
  if public.current_app_role() <> 'technician'
     or public.current_technician_id() is null then
    raise exception 'حساب تسجيل الدخول غير مربوط بفني';
  end if;
  if not exists (
    select 1 from public.buildings where id = p_building_id
  ) then
    raise exception 'المبنى غير موجود';
  end if;
  if p_elevator_id is not null and not exists (
    select 1 from public.elevators
    where id = p_elevator_id and building_id = p_building_id
  ) then
    raise exception 'المصعد لا يتبع المبنى المختار';
  end if;

  insert into public.oil_records(
    building_id, elevator_id, oil_type, oil_brand, oil_quantity,
    price, cost_amount, change_date, next_change_date, notes,
    recorded_by, exclude_from_finance
  )
  values(
    p_building_id, p_elevator_id, trim(p_oil_type), trim(p_oil_brand),
    greatest(coalesce(p_oil_quantity, 0), 0),
    greatest(coalesce(p_price, 0), 0),
    greatest(coalesce(p_cost_amount, 0), 0),
    p_change_date, (p_change_date + interval '6 months')::date,
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid(),
    coalesce(p_exclude_from_finance, false)
  )
  returning id into new_record_id;

  return new_record_id;
end;
$$;

revoke all on function public.technician_record_oil(
  uuid, uuid, text, text, numeric, numeric, numeric, date, text, boolean
) from public, anon;
grant execute on function public.technician_record_oil(
  uuid, uuid, text, text, numeric, numeric, numeric, date, text, boolean
) to authenticated;

commit;

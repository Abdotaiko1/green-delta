-- Technicians may complete maintenance for any elevator and record collection status.

alter table public.maintenance
  add column if not exists payment_collected boolean not null default false;

-- Preserve the financial meaning of older completed maintenance records.
update public.maintenance
set payment_collected = true
where status = 'تمت'
  and exists (
    select 1 from public.elevator_financial_entries as entry
    where entry.maintenance_id = maintenance.id
  );

create or replace function public.technician_maintenance_building_options()
returns table (id uuid, name text, maintenance_line_id uuid)
language sql stable security definer set search_path = public
as $$
  select building.id, building.name, building.maintenance_line_id
  from public.buildings as building
  where public.current_app_role() = 'technician'
  order by building.name;
$$;

create or replace function public.technician_maintenance_elevator_options()
returns table (
  id uuid,
  elevator_number integer,
  elevator_name text,
  building_id uuid,
  maintenance_line_id uuid,
  maintenance_subscription text,
  maintenance_price numeric,
  maintenance_start_date date
)
language sql stable security definer set search_path = public
as $$
  select elevator.id, elevator.elevator_number, elevator.elevator_name,
    elevator.building_id, elevator.maintenance_line_id,
    elevator.maintenance_subscription, null::numeric, elevator.maintenance_start_date
  from public.elevators as elevator
  where public.current_app_role() = 'technician'
  order by elevator.elevator_number;
$$;

revoke all on function public.technician_maintenance_building_options() from public, anon;
grant execute on function public.technician_maintenance_building_options() to authenticated;
revoke all on function public.technician_maintenance_elevator_options() from public, anon;
grant execute on function public.technician_maintenance_elevator_options() to authenticated;

drop function if exists public.technician_complete_maintenance(uuid, date, text);
drop function if exists public.technician_complete_maintenance(uuid, date, text, boolean);

create function public.technician_complete_maintenance(
  p_elevator_id uuid,
  p_visit_date date,
  p_notes text,
  p_payment_collected boolean
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
  if target_elevator.id is null then raise exception 'المصعد غير موجود'; end if;

  insert into public.maintenance (
    type, building_id, elevator_id, visit_date, technician_id, notes,
    status, price, completed_at, payment_collected
  ) values (
    'دورية', target_elevator.building_id, target_elevator.id, p_visit_date,
    technician_record_id, nullif(trim(coalesce(p_notes, '')), ''), 'تمت',
    coalesce(target_elevator.maintenance_price, 0), now(), coalesce(p_payment_collected, false)
  ) returning id into new_maintenance_id;

  return new_maintenance_id;
end;
$$;

revoke all on function public.technician_complete_maintenance(uuid, date, text, boolean) from public, anon;
grant execute on function public.technician_complete_maintenance(uuid, date, text, boolean) to authenticated;

drop policy if exists "role maintenance technician read" on public.maintenance;
create policy "role maintenance technician read"
on public.maintenance for select to authenticated
using (
  public.current_app_role() = 'technician'
  and (
    technician_id = public.current_technician_id()
    or public.technician_has_building(building_id)
  )
);

create or replace function public.sync_maintenance_revenue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'تمت' and new.payment_collected then
    insert into public.elevator_financial_entries (
      elevator_id, building_id, entry_date, entry_type, category,
      description, amount, maintenance_id
    ) values (
      new.elevator_id, new.building_id, new.visit_date, 'إيراد', 'صيانة',
      'إيراد صيانة محصل', coalesce(new.price, 0), new.id
    )
    on conflict (maintenance_id) do update
      set elevator_id = excluded.elevator_id, building_id = excluded.building_id,
          entry_date = excluded.entry_date, amount = excluded.amount,
          description = excluded.description;
  else
    delete from public.elevator_financial_entries where maintenance_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists maintenance_sync_revenue on public.maintenance;
create trigger maintenance_sync_revenue
after insert or update of status, price, visit_date, elevator_id, building_id, payment_collected
on public.maintenance
for each row execute function public.sync_maintenance_revenue();

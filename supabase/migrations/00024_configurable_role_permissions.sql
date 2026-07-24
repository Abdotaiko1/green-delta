-- Configurable per-role, per-module CRUD permissions.
-- Run once in Supabase SQL Editor, then sign out and sign in again.

create table if not exists public.role_permissions (
  role public.user_role not null,
  resource text not null check (resource in (
    'dashboard', 'buildings', 'elevators', 'customers', 'technicians', 'faults',
    'maintenance', 'inventory', 'oil', 'spare_parts', 'finance', 'reports', 'attendance'
  )),
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (role, resource)
);

alter table public.role_permissions enable row level security;
grant select, insert, update, delete on public.role_permissions to authenticated;
revoke all on public.role_permissions from anon;

create or replace function public.has_app_permission(target_resource text, target_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case target_action
        when 'view' then can_view
        when 'create' then can_create
        when 'update' then can_update
        when 'delete' then can_delete
        else false
      end
      from public.role_permissions
      where role = (public.current_app_role())::public.user_role
        and resource = target_resource
    ),
    false
  );
$$;

revoke all on function public.has_app_permission(text, text) from public, anon;
grant execute on function public.has_app_permission(text, text) to authenticated;

drop policy if exists "permissions read" on public.role_permissions;
drop policy if exists "permissions manager insert" on public.role_permissions;
drop policy if exists "permissions manager update" on public.role_permissions;
drop policy if exists "permissions manager delete" on public.role_permissions;

create policy "permissions read" on public.role_permissions for select to authenticated
using (role::text = public.current_app_role() or public.is_app_manager());
create policy "permissions manager insert" on public.role_permissions for insert to authenticated
with check (public.is_app_manager());
create policy "permissions manager update" on public.role_permissions for update to authenticated
using (public.is_app_manager()) with check (public.is_app_manager());
create policy "permissions manager delete" on public.role_permissions for delete to authenticated
using (public.is_app_manager());

-- Defaults preserve the current application behaviour. The manager can change
-- every value later from the Permissions screen.
insert into public.role_permissions (role, resource, can_view, can_create, can_update, can_delete)
select 'manager'::public.user_role, resource, true, true, true, true
from unnest(array[
  'dashboard','buildings','elevators','customers','technicians','faults','maintenance',
  'inventory','oil','spare_parts','finance','reports','attendance'
]) as resource
on conflict (role, resource) do nothing;

insert into public.role_permissions (role, resource, can_view, can_create, can_update, can_delete)
values
  ('accountant', 'dashboard', true, false, false, false),
  ('accountant', 'customers', true, false, false, false),
  ('accountant', 'inventory', true, false, false, false),
  ('accountant', 'finance', true, false, false, false),
  ('accountant', 'reports', true, false, false, false),
  ('technician', 'dashboard', true, false, false, false),
  ('technician', 'buildings', true, false, false, false),
  ('technician', 'elevators', true, false, false, false),
  ('technician', 'faults', true, true, true, false),
  ('technician', 'maintenance', true, true, true, false),
  ('technician', 'oil', true, true, true, false),
  ('technician', 'spare_parts', true, false, false, false)
on conflict (role, resource) do nothing;

-- Ensure every role/resource pair exists so the admin matrix is always complete.
insert into public.role_permissions (role, resource)
select role_name, resource_name
from unnest(enum_range(null::public.user_role)) as roles(role_name)
cross join unnest(array[
  'dashboard','buildings','elevators','customers','technicians','faults','maintenance',
  'inventory','oil','spare_parts','finance','reports','attendance'
]) as resources(resource_name)
on conflict (role, resource) do nothing;

-- Replace older broad policies on business tables with the configurable rules.
do $$
declare
  item record;
  old_policy record;
begin
  for item in
    select * from (values
      ('buildings', 'buildings'),
      ('elevators', 'elevators'),
      ('customers', 'customers'),
      ('technicians', 'technicians'),
      ('technician_buildings', 'technicians'),
      ('technician_tasks', 'technicians'),
      ('faults', 'faults'),
      ('maintenance', 'maintenance'),
      ('maintenance_lines', 'maintenance'),
      ('inventory', 'inventory'),
      ('oil_records', 'oil'),
      ('spare_part_replacements', 'spare_parts'),
      ('elevator_financial_entries', 'finance')
    ) as configured(table_name, resource_name)
  loop
    if to_regclass('public.' || item.table_name) is null then
      continue;
    end if;

    for old_policy in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = item.table_name
    loop
      execute format('drop policy if exists %I on public.%I', old_policy.policyname, item.table_name);
    end loop;

    execute format('alter table public.%I enable row level security', item.table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', item.table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_app_permission(%L, %L))',
      'configurable ' || item.table_name || ' view', item.table_name, item.resource_name, 'view'
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_app_permission(%L, %L))',
      'configurable ' || item.table_name || ' create', item.table_name, item.resource_name, 'create'
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.has_app_permission(%L, %L)) with check (public.has_app_permission(%L, %L))',
      'configurable ' || item.table_name || ' update', item.table_name, item.resource_name, 'update', item.resource_name, 'update'
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.has_app_permission(%L, %L))',
      'configurable ' || item.table_name || ' delete', item.table_name, item.resource_name, 'delete'
    );
  end loop;
end;
$$;

-- Attendance has personal session access in addition to configurable admin access,
-- so normal login/logout keeps working even when the attendance module is hidden.
do $$
declare old_policy record;
begin
  for old_policy in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'login_sessions'
  loop
    execute format('drop policy if exists %I on public.login_sessions', old_policy.policyname);
  end loop;
end;
$$;
create policy "login sessions configurable read" on public.login_sessions for select to authenticated
using (user_id = auth.uid() or public.has_app_permission('attendance', 'view'));
create policy "login sessions configurable insert" on public.login_sessions for insert to authenticated
with check (user_id = auth.uid() or public.has_app_permission('attendance', 'create'));
create policy "login sessions configurable update" on public.login_sessions for update to authenticated
using (user_id = auth.uid() or public.has_app_permission('attendance', 'update'))
with check (user_id = auth.uid() or public.has_app_permission('attendance', 'update'));
create policy "login sessions configurable delete" on public.login_sessions for delete to authenticated
using (public.has_app_permission('attendance', 'delete'));

-- Apply the same permission checks to SECURITY DEFINER technician operations.
-- Those functions intentionally bypass RLS, so each one must guard itself.
create or replace function public.technician_oil_building_options()
returns table (id uuid, name text)
language sql stable security definer set search_path = public
as $$
  select building.id, building.name from public.buildings as building
  where public.current_app_role() = 'technician'
    and public.has_app_permission('oil', 'view')
  order by building.name;
$$;

create or replace function public.technician_oil_elevator_options()
returns table (id uuid, building_id uuid, elevator_number integer, elevator_name text)
language sql stable security definer set search_path = public
as $$
  select elevator.id, elevator.building_id, elevator.elevator_number, elevator.elevator_name
  from public.elevators as elevator
  where public.current_app_role() = 'technician'
    and public.has_app_permission('oil', 'view')
  order by elevator.elevator_number;
$$;

create or replace function public.technician_maintenance_building_options()
returns table (id uuid, name text, maintenance_line_id uuid)
language sql stable security definer set search_path = public
as $$
  select building.id, building.name, building.maintenance_line_id
  from public.buildings as building
  where public.current_app_role() = 'technician'
    and public.has_app_permission('maintenance', 'view')
  order by building.name;
$$;

create or replace function public.technician_maintenance_elevator_options()
returns table (
  id uuid, elevator_number integer, elevator_name text, building_id uuid,
  maintenance_line_id uuid, maintenance_subscription text,
  maintenance_price numeric, maintenance_start_date date
)
language sql stable security definer set search_path = public
as $$
  select elevator.id, elevator.elevator_number, elevator.elevator_name,
    elevator.building_id, elevator.maintenance_line_id,
    elevator.maintenance_subscription, elevator.maintenance_price,
    elevator.maintenance_start_date
  from public.elevators as elevator
  where public.current_app_role() = 'technician'
    and public.has_app_permission('maintenance', 'view')
  order by elevator.elevator_number;
$$;

create or replace function public.technician_record_oil(
  p_building_id uuid, p_elevator_id uuid, p_oil_type text, p_oil_brand text,
  p_oil_quantity numeric, p_price numeric, p_cost_amount numeric,
  p_change_date date, p_notes text
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_record_id uuid;
begin
  if not public.has_app_permission('oil', 'create') then raise exception 'غير مسموح بإضافة تغيير زيت'; end if;
  if public.current_app_role() <> 'technician' or public.current_technician_id() is null then raise exception 'حساب تسجيل الدخول غير مربوط بفني'; end if;
  if not exists(select 1 from public.buildings where id = p_building_id) then raise exception 'المبنى غير موجود'; end if;
  if p_elevator_id is not null and not exists(select 1 from public.elevators where id = p_elevator_id and building_id = p_building_id) then raise exception 'المصعد لا يتبع المبنى المختار'; end if;
  insert into public.oil_records(building_id, elevator_id, oil_type, oil_brand, oil_quantity, price, cost_amount, change_date, next_change_date, notes, recorded_by)
  values(p_building_id, p_elevator_id, trim(p_oil_type), trim(p_oil_brand), greatest(coalesce(p_oil_quantity,0),0), greatest(coalesce(p_price,0),0), greatest(coalesce(p_cost_amount,0),0), p_change_date, (p_change_date + interval '6 months')::date, nullif(trim(coalesce(p_notes,'')),''), auth.uid())
  returning id into new_record_id;
  return new_record_id;
end;
$$;

create or replace function public.technician_complete_maintenance(
  p_elevator_id uuid, p_visit_date date, p_notes text, p_payment_collected boolean
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  target_elevator public.elevators%rowtype;
  technician_record_id uuid;
  new_maintenance_id uuid;
begin
  if not public.has_app_permission('maintenance', 'update') then raise exception 'غير مسموح بإتمام الصيانة'; end if;
  technician_record_id := public.current_technician_id();
  if public.current_app_role() <> 'technician' or technician_record_id is null then raise exception 'حساب تسجيل الدخول غير مربوط بفني'; end if;
  select * into target_elevator from public.elevators where id = p_elevator_id;
  if target_elevator.id is null then raise exception 'المصعد غير موجود'; end if;
  insert into public.maintenance(type, building_id, elevator_id, visit_date, technician_id, notes, status, price, completed_at, payment_collected)
  values('دورية', target_elevator.building_id, target_elevator.id, p_visit_date, technician_record_id, nullif(trim(coalesce(p_notes,'')),''), 'تمت', coalesce(target_elevator.maintenance_price,0), now(), coalesce(p_payment_collected,false))
  returning id into new_maintenance_id;
  return new_maintenance_id;
end;
$$;

create or replace function public.technician_set_fault_result(p_fault_id uuid, p_repair_status text, p_fault_cause text)
returns void language plpgsql security definer set search_path = public
as $$
declare technician_record_id uuid;
begin
  if not public.has_app_permission('faults', 'update') then raise exception 'غير مسموح بتعديل العطل'; end if;
  technician_record_id := public.current_technician_id();
  if public.current_app_role() <> 'technician' or technician_record_id is null then raise exception 'حساب تسجيل الدخول غير مربوط بفني'; end if;
  if p_repair_status not in ('تم الإصلاح', 'ما زال عاطل') then raise exception 'حالة الإصلاح غير صحيحة'; end if;
  if length(trim(coalesce(p_fault_cause,''))) = 0 then raise exception 'سبب العطل إجباري'; end if;
  update public.faults set repair_status = p_repair_status, fault_cause = trim(p_fault_cause),
    status = case when p_repair_status = 'تم الإصلاح' then 'مغلق' else 'قيد المعالجة' end,
    repaired_at = case when p_repair_status = 'تم الإصلاح' then now() else null end
  where id = p_fault_id and technician_id = technician_record_id;
  if not found then raise exception 'هذا العطل غير مسند إلى الفني'; end if;
end;
$$;

create or replace function public.technician_set_fault_task_result(p_task_id uuid, p_repair_status text, p_fault_cause text)
returns void language plpgsql security definer set search_path = public
as $$
declare technician_record_id uuid;
begin
  if not public.has_app_permission('faults', 'update') then raise exception 'غير مسموح بتعديل العطل'; end if;
  technician_record_id := public.current_technician_id();
  if public.current_app_role() <> 'technician' or technician_record_id is null then raise exception 'حساب تسجيل الدخول غير مربوط بفني'; end if;
  if p_repair_status not in ('تم الإصلاح', 'ما زال عاطل') then raise exception 'حالة الإصلاح غير صحيحة'; end if;
  if length(trim(coalesce(p_fault_cause,''))) = 0 then raise exception 'سبب العطل إجباري'; end if;
  update public.technician_tasks set fault_result = p_repair_status, fault_cause = trim(p_fault_cause),
    status = case when p_repair_status = 'تم الإصلاح' then 'تمت' else 'مكلف' end,
    completed_at = case when p_repair_status = 'تم الإصلاح' then now() else null end
  where id = p_task_id and technician_id = technician_record_id and task_type = 'عطل';
  if not found then raise exception 'مهمة العطل غير مسندة إلى الفني'; end if;
end;
$$;

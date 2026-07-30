-- Oil schedule sheet and per-account permissions.
-- The system owner is the Authentication account greendelta@admin.com.

-- Preserve the exact time of every oil-change confirmation. Existing records
-- use midnight Cairo time for their historical change_date.
alter table public.oil_records
  add column if not exists changed_at timestamptz;

update public.oil_records
set changed_at = change_date::timestamp at time zone 'Africa/Cairo'
where changed_at is null;

alter table public.oil_records
  alter column changed_at set default now(),
  alter column changed_at set not null;

create index if not exists oil_records_elevator_changed_idx
  on public.oil_records(elevator_id, changed_at desc);

create or replace function public.set_oil_next_change_date()
returns trigger
language plpgsql
as $$
begin
  new.changed_at := coalesce(new.changed_at, now());
  new.next_change_date := (new.change_date + interval '6 months')::date;
  return new;
end;
$$;

drop trigger if exists oil_records_set_next_change_date on public.oil_records;
create trigger oil_records_set_next_change_date
before insert or update of change_date
on public.oil_records
for each row execute function public.set_oil_next_change_date();

-- The oil screen derives one live row from every active elevator. This RPC
-- supplies technicians with the same line/building grouping without exposing
-- financial building data.
drop function if exists public.technician_oil_elevator_options();
create function public.technician_oil_elevator_options()
returns table (
  id uuid,
  building_id uuid,
  elevator_number integer,
  elevator_name text,
  created_at timestamptz,
  building_name text,
  maintenance_line_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    elevator.id,
    elevator.building_id,
    elevator.elevator_number,
    elevator.elevator_name,
    elevator.created_at,
    building.name,
    line.name
  from public.elevators as elevator
  join public.buildings as building on building.id = elevator.building_id
  join public.maintenance_lines as line
    on line.id = coalesce(elevator.maintenance_line_id, building.maintenance_line_id)
  where public.current_app_role() = 'technician'
    and public.has_app_permission('oil', 'view')
    and elevator.archived_at is null
    and building.archived_at is null
  order by line.name, building.name, elevator.elevator_number;
$$;

revoke all on function public.technician_oil_elevator_options() from public, anon;
grant execute on function public.technician_oil_elevator_options() to authenticated;

-- Owner identity is based on the authenticated email, so changing a normal
-- manager's role can never grant access to account permission administration.
create or replace function public.is_system_owner()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users
    where id = auth.uid()
      and lower(email) = 'greendelta@admin.com'
  );
$$;

revoke all on function public.is_system_owner() from public, anon;
grant execute on function public.is_system_owner() to authenticated;

-- If the owner already exists in Authentication, ensure its application role
-- is manager. The repair function below also handles accounts created later.
insert into public.users(id, role, full_name)
select
  account.id,
  'manager'::public.user_role,
  coalesce(
    nullif(account.raw_user_meta_data ->> 'full_name', ''),
    nullif(account.raw_user_meta_data ->> 'name', ''),
    'مالك النظام'
  )
from auth.users as account
where lower(account.email) = 'greendelta@admin.com'
on conflict (id) do update
set role = 'manager'::public.user_role;

create or replace function public.ensure_current_user_profile()
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  account auth.users%rowtype;
  assigned_role public.user_role;
  assigned_name text;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;

  select * into account
  from auth.users
  where id = auth.uid();

  if account.id is null then
    raise exception 'حساب الدخول غير موجود';
  end if;

  assigned_role := case
    when lower(account.email) = 'greendelta@admin.com' then 'manager'::public.user_role
    when account.raw_user_meta_data ->> 'app_role' in ('manager', 'accountant', 'technician')
      then (account.raw_user_meta_data ->> 'app_role')::public.user_role
    else 'technician'::public.user_role
  end;
  assigned_name := coalesce(
    nullif(account.raw_user_meta_data ->> 'full_name', ''),
    nullif(account.raw_user_meta_data ->> 'name', ''),
    split_part(account.email, '@', 1)
  );

  insert into public.users as existing_user(id, role, full_name)
  values(account.id, assigned_role, assigned_name)
  on conflict (id) do update
  set role = case
        when lower(account.email) = 'greendelta@admin.com'
          then 'manager'::public.user_role
        else existing_user.role
      end,
      full_name = case
        when length(trim(existing_user.full_name)) = 0 then excluded.full_name
        else existing_user.full_name
      end;

  select role into assigned_role
  from public.users
  where id = account.id;

  return assigned_role::text;
end;
$$;

revoke all on function public.ensure_current_user_profile() from public, anon;
grant execute on function public.ensure_current_user_profile() to authenticated;

create table if not exists public.user_permissions (
  user_id uuid not null references public.users(id) on delete cascade,
  resource text not null check (resource in (
    'dashboard', 'buildings', 'elevators', 'customers', 'technicians', 'faults',
    'maintenance', 'inventory', 'oil', 'spare_parts', 'finance', 'reports',
    'attendance', 'audit_log'
  )),
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(user_id, resource)
);

alter table public.user_permissions enable row level security;
grant select, insert, update, delete on public.user_permissions to authenticated;
revoke all on public.user_permissions from anon;

drop policy if exists "user permissions own or owner read" on public.user_permissions;
drop policy if exists "user permissions owner insert" on public.user_permissions;
drop policy if exists "user permissions owner update" on public.user_permissions;
drop policy if exists "user permissions owner delete" on public.user_permissions;

create policy "user permissions own or owner read"
on public.user_permissions for select to authenticated
using (user_id = auth.uid() or public.is_system_owner());

create policy "user permissions owner insert"
on public.user_permissions for insert to authenticated
with check (public.is_system_owner());

create policy "user permissions owner update"
on public.user_permissions for update to authenticated
using (public.is_system_owner())
with check (public.is_system_owner());

create policy "user permissions owner delete"
on public.user_permissions for delete to authenticated
using (public.is_system_owner());

-- Account-specific permissions override the role defaults. The owner always
-- has full access, regardless of any rows accidentally stored for that user.
create or replace function public.has_app_permission(target_resource text, target_action text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when public.is_system_owner() then true
    else coalesce(
      (
        select case target_action
          when 'view' then permission.can_view
          when 'create' then permission.can_create
          when 'update' then permission.can_update
          when 'delete' then permission.can_delete
          else false
        end
        from public.user_permissions as permission
        where permission.user_id = auth.uid()
          and permission.resource = target_resource
      ),
      (
        select case target_action
          when 'view' then permission.can_view
          when 'create' then permission.can_create
          when 'update' then permission.can_update
          when 'delete' then permission.can_delete
          else false
        end
        from public.role_permissions as permission
        where permission.role = (public.current_app_role())::public.user_role
          and permission.resource = target_resource
      ),
      false
    )
  end;
$$;

revoke all on function public.has_app_permission(text, text) from public, anon;
grant execute on function public.has_app_permission(text, text) to authenticated;

-- Other managers keep their operational permissions but can no longer edit
-- the shared role matrix. Only the owner may administer permissions.
drop policy if exists "permissions read" on public.role_permissions;
drop policy if exists "permissions manager insert" on public.role_permissions;
drop policy if exists "permissions manager update" on public.role_permissions;
drop policy if exists "permissions manager delete" on public.role_permissions;

create policy "permissions read"
on public.role_permissions for select to authenticated
using (role::text = public.current_app_role() or public.is_system_owner());

create policy "permissions manager insert"
on public.role_permissions for insert to authenticated
with check (public.is_system_owner());

create policy "permissions manager update"
on public.role_permissions for update to authenticated
using (public.is_system_owner())
with check (public.is_system_owner());

create policy "permissions manager delete"
on public.role_permissions for delete to authenticated
using (public.is_system_owner());

create or replace function public.list_permission_accounts()
returns table (
  id uuid,
  email text,
  full_name text,
  role text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_system_owner() then
    raise exception 'إدارة صلاحيات الحسابات متاحة لمالك النظام فقط';
  end if;

  return query
  select
    profile.id,
    account.email::text,
    profile.full_name,
    profile.role::text
  from public.users as profile
  join auth.users as account on account.id = profile.id
  order by
    case when lower(account.email) = 'greendelta@admin.com' then 0 else 1 end,
    profile.full_name,
    account.email;
end;
$$;

revoke all on function public.list_permission_accounts() from public, anon;
grant execute on function public.list_permission_accounts() to authenticated;

-- Real role-based access, technician building assignments, and login attendance.
-- IMPORTANT: disable VITE_BYPASS_AUTH and run this after all previous migrations.

-- Some exported projects were created without the original public.users table.
do $$
begin
  create type public.user_role as enum ('manager', 'technician', 'accountant');
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'technician',
  full_name text not null,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
grant select, insert, update, delete on public.users to authenticated;
revoke all on public.users from anon;

-- Link the test/admin accounts already created by the older project scripts.
insert into public.users (id, role, full_name)
select
  auth_user.id,
  case
    when lower(auth_user.email) in ('admin@greendelta.com', 'manager@example.com') then 'manager'::public.user_role
    when lower(auth_user.email) = 'accountant@example.com' then 'accountant'::public.user_role
    else 'technician'::public.user_role
  end,
  coalesce(auth_user.raw_user_meta_data ->> 'full_name', split_part(auth_user.email, '@', 1))
from auth.users as auth_user
where lower(auth_user.email) in ('admin@greendelta.com', 'manager@example.com', 'accountant@example.com', 'tech@example.com')
on conflict (id) do update
set role = excluded.role, full_name = excluded.full_name;

create or replace function public.is_app_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'manager');
$$;

drop policy if exists "Users can read their own data or manager can read all" on public.users;
drop policy if exists "Manager can insert users" on public.users;
drop policy if exists "Manager can update users" on public.users;
drop policy if exists "Manager can delete users" on public.users;

create policy "users own or manager read" on public.users for select to authenticated
using (id = auth.uid() or public.is_app_manager());
create policy "users manager insert" on public.users for insert to authenticated
with check (public.is_app_manager());
create policy "users manager update" on public.users for update to authenticated
using (public.is_app_manager()) with check (public.is_app_manager());
create policy "users manager delete" on public.users for delete to authenticated
using (public.is_app_manager());

create table if not exists public.technician_buildings (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null references public.technicians(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (technician_id, building_id)
);

create table if not exists public.login_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  login_at timestamptz not null default now(),
  logout_at timestamptz,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  created_at timestamptz not null default now()
);

create index if not exists technician_buildings_technician_idx on public.technician_buildings(technician_id);
create index if not exists technician_buildings_building_idx on public.technician_buildings(building_id);
create index if not exists login_sessions_user_login_idx on public.login_sessions(user_id, login_at desc);

alter table public.spare_part_replacements
  add column if not exists part_code_snapshot text;

update public.spare_part_replacements as replacement
set part_code_snapshot = coalesce(inventory.part_code, 'خارجي')
from public.inventory as inventory
where inventory.id = replacement.inventory_id
  and replacement.part_code_snapshot is null;

update public.spare_part_replacements
set part_code_snapshot = 'خارجي'
where inventory_id is null and part_code_snapshot is null;

create or replace function public.capture_replacement_part_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.inventory_id is null then
    new.part_code_snapshot := 'خارجي';
  else
    select part_code into new.part_code_snapshot
    from public.inventory where id = new.inventory_id;
  end if;
  return new;
end;
$$;

drop trigger if exists spare_parts_capture_code on public.spare_part_replacements;
create trigger spare_parts_capture_code
before insert or update of inventory_id on public.spare_part_replacements
for each row execute function public.capture_replacement_part_code();

alter table public.technician_buildings enable row level security;
alter table public.login_sessions enable row level security;

grant select, insert, update, delete on public.technician_buildings to authenticated;
grant select, insert, update, delete on public.login_sessions to authenticated;
revoke all on public.technician_buildings from anon;
revoke all on public.login_sessions from anon;

create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = public as $$
  select role::text from public.users where id = auth.uid();
$$;

create or replace function public.current_technician_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.technicians where user_id = auth.uid() limit 1;
$$;

create or replace function public.technician_has_building(target_building_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.technician_buildings
    where technician_id = public.current_technician_id()
      and building_id = target_building_id
  );
$$;

-- After creating a user in Authentication > Users, link their email to an app role.
create or replace function public.link_auth_user(user_email text, user_full_name text, user_role_name text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user_id uuid;
begin
  if user_role_name not in ('manager', 'accountant', 'technician') then
    raise exception 'الدور يجب أن يكون manager أو accountant أو technician';
  end if;
  if auth.uid() is not null and public.current_app_role() <> 'manager' then
    raise exception 'هذه العملية متاحة للمدير فقط';
  end if;
  select id into target_user_id from auth.users where lower(email) = lower(user_email) limit 1;
  if target_user_id is null then
    raise exception 'أنشئ المستخدم أولاً من Authentication > Users';
  end if;
  insert into public.users (id, full_name, role)
  values (target_user_id, user_full_name, user_role_name::public.user_role)
  on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;
  return target_user_id;
end;
$$;

revoke all on function public.link_auth_user(text, text, text) from public, anon;
grant execute on function public.link_auth_user(text, text, text) to authenticated;

-- Remove the former demo/public policies and older broad technician policies.
drop policy if exists "Local app full access buildings" on public.buildings;
drop policy if exists "Manager can do all on buildings" on public.buildings;
drop policy if exists "Technicians can read buildings" on public.buildings;
drop policy if exists "Local app full access elevators" on public.elevators;
drop policy if exists "Manager can do all on elevators" on public.elevators;
drop policy if exists "Technicians can read elevators" on public.elevators;
drop policy if exists "Local app full access customers" on public.customers;
drop policy if exists "Manager and accountant can read customers" on public.customers;
drop policy if exists "Manager can insert customers" on public.customers;
drop policy if exists "Manager can update customers" on public.customers;
drop policy if exists "Manager can delete customers" on public.customers;
drop policy if exists "Local app full access technicians" on public.technicians;
drop policy if exists "Manager can do all on technicians" on public.technicians;
drop policy if exists "Technicians can read technicians" on public.technicians;
drop policy if exists "Local app full access faults" on public.faults;
drop policy if exists "Manager can do all on faults" on public.faults;
drop policy if exists "Technician can read assigned faults" on public.faults;
drop policy if exists "Technician can update assigned faults" on public.faults;
drop policy if exists "Local app full access maintenance" on public.maintenance;
drop policy if exists "Manager can do all on maintenance" on public.maintenance;
drop policy if exists "Technician can read assigned maintenance" on public.maintenance;
drop policy if exists "Technician can update assigned maintenance" on public.maintenance;
drop policy if exists "Local app full access inventory" on public.inventory;
drop policy if exists "Manager and accountant can read inventory" on public.inventory;
drop policy if exists "Manager can do all on inventory" on public.inventory;
drop policy if exists "Local app full access oil records" on public.oil_records;
drop policy if exists "Manager can do all on oil_records" on public.oil_records;
drop policy if exists "Technician can do all on oil_records" on public.oil_records;
drop policy if exists "Accountant can read oil_records" on public.oil_records;
drop policy if exists "Local app full access spare parts" on public.spare_part_replacements;
drop policy if exists "Local app full access elevator financial entries" on public.elevator_financial_entries;
drop policy if exists "Local app full access maintenance lines" on public.maintenance_lines;

-- Buildings and elevators: technicians only see assigned buildings.
create policy "role buildings manager" on public.buildings for all to authenticated
using (public.current_app_role() = 'manager') with check (public.current_app_role() = 'manager');
create policy "role buildings accountant read" on public.buildings for select to authenticated
using (public.current_app_role() = 'accountant');
create policy "role buildings technician assigned" on public.buildings for select to authenticated
using (public.current_app_role() = 'technician' and public.technician_has_building(id));

create policy "role elevators manager" on public.elevators for all to authenticated
using (public.current_app_role() = 'manager') with check (public.current_app_role() = 'manager');
create policy "role elevators accountant read" on public.elevators for select to authenticated
using (public.current_app_role() = 'accountant');
create policy "role elevators technician assigned" on public.elevators for select to authenticated
using (public.current_app_role() = 'technician' and public.technician_has_building(building_id));

-- Customers and inventory/finance are never available to technicians.
create policy "role customers manager" on public.customers for all to authenticated
using (public.current_app_role() = 'manager') with check (public.current_app_role() = 'manager');
create policy "role customers accountant read" on public.customers for select to authenticated
using (public.current_app_role() = 'accountant');

create policy "role inventory manager" on public.inventory for all to authenticated
using (public.current_app_role() = 'manager') with check (public.current_app_role() = 'manager');
create policy "role inventory accountant read" on public.inventory for select to authenticated
using (public.current_app_role() = 'accountant');

create policy "role finance manager" on public.elevator_financial_entries for all to authenticated
using (public.current_app_role() = 'manager') with check (public.current_app_role() = 'manager');
create policy "role finance accountant read" on public.elevator_financial_entries for select to authenticated
using (public.current_app_role() = 'accountant');

-- Technician directory and assignment administration.
create policy "role technicians manager" on public.technicians for all to authenticated
using (public.current_app_role() = 'manager') with check (public.current_app_role() = 'manager');
create policy "role technicians staff read" on public.technicians for select to authenticated
using (public.current_app_role() = 'technician');

create policy "role assignments manager" on public.technician_buildings for all to authenticated
using (public.current_app_role() = 'manager') with check (public.current_app_role() = 'manager');
create policy "role assignments technician own" on public.technician_buildings for select to authenticated
using (public.current_app_role() = 'technician' and technician_id = public.current_technician_id());

-- Operational history on assigned buildings.
create policy "role faults manager" on public.faults for all to authenticated
using (public.current_app_role() = 'manager') with check (public.current_app_role() = 'manager');
create policy "role faults technician read" on public.faults for select to authenticated
using (public.current_app_role() = 'technician' and public.technician_has_building(building_id));
create policy "role faults technician insert" on public.faults for insert to authenticated
with check (public.current_app_role() = 'technician' and public.technician_has_building(building_id));
create policy "role faults technician update" on public.faults for update to authenticated
using (public.current_app_role() = 'technician' and public.technician_has_building(building_id))
with check (public.current_app_role() = 'technician' and public.technician_has_building(building_id));

create policy "role maintenance manager" on public.maintenance for all to authenticated
using (public.current_app_role() = 'manager') with check (public.current_app_role() = 'manager');
create policy "role maintenance technician read" on public.maintenance for select to authenticated
using (public.current_app_role() = 'technician' and public.technician_has_building(building_id));
create policy "role maintenance technician update" on public.maintenance for update to authenticated
using (public.current_app_role() = 'technician' and public.technician_has_building(building_id))
with check (public.current_app_role() = 'technician' and public.technician_has_building(building_id));

create policy "role oil manager" on public.oil_records for all to authenticated
using (public.current_app_role() = 'manager') with check (public.current_app_role() = 'manager');
create policy "role oil technician read" on public.oil_records for select to authenticated
using (public.current_app_role() = 'technician' and public.technician_has_building(building_id));
create policy "role oil technician insert" on public.oil_records for insert to authenticated
with check (public.current_app_role() = 'technician' and public.technician_has_building(building_id));
create policy "role oil technician update" on public.oil_records for update to authenticated
using (public.current_app_role() = 'technician' and public.technician_has_building(building_id))
with check (public.current_app_role() = 'technician' and public.technician_has_building(building_id));

create policy "role spare parts manager" on public.spare_part_replacements for all to authenticated
using (public.current_app_role() = 'manager') with check (public.current_app_role() = 'manager');
create policy "role spare parts technician read" on public.spare_part_replacements for select to authenticated
using (public.current_app_role() = 'technician' and public.technician_has_building(building_id));

create policy "role maintenance lines manager" on public.maintenance_lines for all to authenticated
using (public.current_app_role() = 'manager') with check (public.current_app_role() = 'manager');
create policy "role maintenance lines staff read" on public.maintenance_lines for select to authenticated
using (public.current_app_role() in ('technician', 'accountant'));

-- Login/logout attendance. Every user writes their own session; manager reads all.
create policy "login sessions own insert" on public.login_sessions for insert to authenticated
with check (user_id = auth.uid());
create policy "login sessions own read" on public.login_sessions for select to authenticated
using (user_id = auth.uid() or public.current_app_role() = 'manager');
create policy "login sessions own logout" on public.login_sessions for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

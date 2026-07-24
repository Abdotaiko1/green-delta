-- One-time schema completion for the current local/demo application.
-- The frontend currently uses VITE_BYPASS_AUTH=true, so Supabase receives
-- requests as the anon role. These policies are suitable for a local demo;
-- switch to real Supabase Auth before exposing the application publicly.

create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  address text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.technicians (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text not null,
  phone text not null,
  specialization text not null,
  status text not null default 'متاح' check (status in ('متاح', 'مشغول', 'إجازة')),
  created_at timestamptz not null default now()
);

create table if not exists public.faults (
  id uuid primary key default gen_random_uuid(),
  report_number text not null unique,
  building_id uuid not null references public.buildings(id) on delete cascade,
  elevator_id uuid not null references public.elevators(id) on delete cascade,
  description text not null,
  priority text not null default 'متوسطة' check (priority in ('عالية', 'متوسطة', 'منخفضة')),
  technician_id uuid references public.technicians(id) on delete set null,
  status text not null default 'مفتوح' check (status in ('مفتوح', 'قيد المعالجة', 'مغلق')),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  part_name text not null,
  quantity integer not null default 0,
  purchase_price numeric not null default 0,
  sale_price numeric not null default 0,
  supplier text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.maintenance (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'دورية' check (type in ('دورية', 'طارئة')),
  building_id uuid not null references public.buildings(id) on delete cascade,
  elevator_id uuid not null references public.elevators(id) on delete cascade,
  visit_date date not null,
  technician_id uuid not null references public.technicians(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.oil_records (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  elevator_id uuid references public.elevators(id) on delete cascade,
  oil_type text not null,
  oil_brand text not null,
  oil_quantity numeric not null default 0,
  change_date date not null,
  next_change_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

create or replace function public.set_oil_next_change_date()
returns trigger
language plpgsql
as $$
begin
  new.next_change_date := (new.change_date + interval '6 months')::date;
  return new;
end;
$$;

drop trigger if exists oil_records_set_next_change_date on public.oil_records;
create trigger oil_records_set_next_change_date
before insert or update of change_date on public.oil_records
for each row execute function public.set_oil_next_change_date();

create index if not exists oil_records_next_change_date_idx on public.oil_records(next_change_date);
create index if not exists oil_records_building_id_idx on public.oil_records(building_id);
create index if not exists faults_building_id_idx on public.faults(building_id);
create index if not exists faults_elevator_id_idx on public.faults(elevator_id);
create index if not exists maintenance_visit_date_idx on public.maintenance(visit_date);

alter table public.buildings enable row level security;
alter table public.elevators enable row level security;
alter table public.customers enable row level security;
alter table public.technicians enable row level security;
alter table public.faults enable row level security;
alter table public.inventory enable row level security;
alter table public.maintenance enable row level security;
alter table public.oil_records enable row level security;

grant select, insert, update, delete on public.buildings to anon, authenticated;
grant select, insert, update, delete on public.elevators to anon, authenticated;
grant select, insert, update, delete on public.customers to anon, authenticated;
grant select, insert, update, delete on public.technicians to anon, authenticated;
grant select, insert, update, delete on public.faults to anon, authenticated;
grant select, insert, update, delete on public.inventory to anon, authenticated;
grant select, insert, update, delete on public.maintenance to anon, authenticated;
grant select, insert, update, delete on public.oil_records to anon, authenticated;

drop policy if exists "Local app full access buildings" on public.buildings;
create policy "Local app full access buildings" on public.buildings
for all to anon, authenticated using (true) with check (true);

drop policy if exists "Local app full access elevators" on public.elevators;
create policy "Local app full access elevators" on public.elevators
for all to anon, authenticated using (true) with check (true);

drop policy if exists "Local app full access customers" on public.customers;
create policy "Local app full access customers" on public.customers
for all to anon, authenticated using (true) with check (true);

drop policy if exists "Local app full access technicians" on public.technicians;
create policy "Local app full access technicians" on public.technicians
for all to anon, authenticated using (true) with check (true);

drop policy if exists "Local app full access faults" on public.faults;
create policy "Local app full access faults" on public.faults
for all to anon, authenticated using (true) with check (true);

drop policy if exists "Local app full access inventory" on public.inventory;
create policy "Local app full access inventory" on public.inventory
for all to anon, authenticated using (true) with check (true);

drop policy if exists "Local app full access maintenance" on public.maintenance;
create policy "Local app full access maintenance" on public.maintenance
for all to anon, authenticated using (true) with check (true);

drop policy if exists "Local app full access oil records" on public.oil_records;
create policy "Local app full access oil records" on public.oil_records
for all to anon, authenticated using (true) with check (true);

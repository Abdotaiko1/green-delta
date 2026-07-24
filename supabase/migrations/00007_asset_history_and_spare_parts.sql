-- Run once after 00006_complete_local_app_and_oil.sql.
-- Adds the elevator spare-part replacement history used by the app.

create table if not exists public.spare_part_replacements (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  elevator_id uuid not null references public.elevators(id) on delete cascade,
  part_name text not null,
  replacement_date date not null default current_date,
  price numeric not null default 0 check (price >= 0),
  technician_id uuid references public.technicians(id) on delete set null,
  invoice_number text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists spare_part_replacements_building_idx
  on public.spare_part_replacements(building_id);
create index if not exists spare_part_replacements_elevator_idx
  on public.spare_part_replacements(elevator_id);
create index if not exists spare_part_replacements_date_idx
  on public.spare_part_replacements(replacement_date desc);

alter table public.spare_part_replacements enable row level security;

grant select, insert, update, delete
  on public.spare_part_replacements to anon, authenticated;

drop policy if exists "Local app full access spare parts" on public.spare_part_replacements;
create policy "Local app full access spare parts"
on public.spare_part_replacements
for all to anon, authenticated
using (true)
with check (true);

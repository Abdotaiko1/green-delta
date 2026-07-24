-- Maintenance lines group buildings and elevators.
-- Run once after the previous migrations.

create table if not exists public.maintenance_lines (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

alter table public.maintenance_lines enable row level security;
grant select, insert, update, delete on public.maintenance_lines to anon, authenticated;

drop policy if exists "Local app full access maintenance lines" on public.maintenance_lines;
create policy "Local app full access maintenance lines"
on public.maintenance_lines
for all to anon, authenticated using (true) with check (true);

insert into public.maintenance_lines (name)
values ('خط أكتوبر'), ('خط حدائق الأهرام'), ('خط فيصل'), ('غير محدد')
on conflict (name) do nothing;

alter table public.buildings add column if not exists maintenance_line_id uuid;
alter table public.elevators add column if not exists maintenance_line_id uuid;

update public.buildings
set maintenance_line_id = (select id from public.maintenance_lines where name = 'غير محدد')
where maintenance_line_id is null;

update public.elevators as elevator
set maintenance_line_id = building.maintenance_line_id
from public.buildings as building
where building.id = elevator.building_id
  and (elevator.maintenance_line_id is null or elevator.maintenance_line_id <> building.maintenance_line_id);

alter table public.buildings drop constraint if exists buildings_maintenance_line_id_fkey;
alter table public.buildings
  add constraint buildings_maintenance_line_id_fkey
  foreign key (maintenance_line_id) references public.maintenance_lines(id) on delete restrict;

alter table public.elevators drop constraint if exists elevators_maintenance_line_id_fkey;
alter table public.elevators
  add constraint elevators_maintenance_line_id_fkey
  foreign key (maintenance_line_id) references public.maintenance_lines(id) on delete restrict;

alter table public.buildings alter column maintenance_line_id set not null;
alter table public.elevators alter column maintenance_line_id set not null;

create index if not exists buildings_maintenance_line_id_idx on public.buildings(maintenance_line_id);
create index if not exists elevators_maintenance_line_id_idx on public.elevators(maintenance_line_id);

create or replace function public.keep_elevator_in_building_line()
returns trigger
language plpgsql
as $$
declare
  building_line_id uuid;
begin
  select maintenance_line_id into building_line_id
  from public.buildings
  where id = new.building_id;

  if building_line_id is null or new.maintenance_line_id is distinct from building_line_id then
    raise exception 'خط المصعد يجب أن يكون نفس خط المبنى';
  end if;
  return new;
end;
$$;

drop trigger if exists elevators_validate_maintenance_line on public.elevators;
create trigger elevators_validate_maintenance_line
before insert or update of building_id, maintenance_line_id
on public.elevators
for each row execute function public.keep_elevator_in_building_line();

create or replace function public.move_building_elevators_to_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.maintenance_line_id is distinct from old.maintenance_line_id then
    update public.elevators
    set maintenance_line_id = new.maintenance_line_id
    where building_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists buildings_sync_elevator_line on public.buildings;
create trigger buildings_sync_elevator_line
after update of maintenance_line_id
on public.buildings
for each row execute function public.move_building_elevators_to_line();


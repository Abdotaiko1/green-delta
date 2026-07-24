-- Adds elevator maintenance contract data and automatic due-date calculation.
-- Run once after the previous project migrations.

alter table public.elevators
  add column if not exists maintenance_start_date date,
  add column if not exists maintenance_subscription text not null default 'شهري',
  add column if not exists maintenance_price numeric,
  add column if not exists wire_size text,
  add column if not exists stops_count integer,
  add column if not exists operation_start_date date,
  add column if not exists next_maintenance_date date;

alter table public.elevators alter column brand drop not null;
alter table public.elevators alter column capacity drop not null;
alter table public.elevators alter column installation_year drop not null;

-- The model field was explicitly removed from the application.
alter table public.elevators drop column if exists model;

alter table public.elevators
  drop constraint if exists elevators_maintenance_subscription_check;
alter table public.elevators
  add constraint elevators_maintenance_subscription_check
  check (maintenance_subscription in ('شهري', '٣ شهور', '٦ شهور', 'سنوي'));

alter table public.elevators
  drop constraint if exists elevators_maintenance_price_check;
alter table public.elevators
  add constraint elevators_maintenance_price_check
  check (maintenance_price is null or maintenance_price >= 0);

alter table public.elevators
  drop constraint if exists elevators_stops_count_check;
alter table public.elevators
  add constraint elevators_stops_count_check
  check (stops_count is null or stops_count >= 0);

create or replace function public.calculate_elevator_next_maintenance()
returns trigger
language plpgsql
as $$
declare
  base_date date;
begin
  base_date := coalesce(new.last_maintenance_date, new.maintenance_start_date);

  if base_date is null then
    new.next_maintenance_date := null;
  else
    new.next_maintenance_date := case new.maintenance_subscription
      when 'شهري' then (base_date + interval '1 month')::date
      when '٣ شهور' then (base_date + interval '3 months')::date
      when '٦ شهور' then (base_date + interval '6 months')::date
      when 'سنوي' then (base_date + interval '1 year')::date
      else null
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists elevators_calculate_next_maintenance on public.elevators;
create trigger elevators_calculate_next_maintenance
before insert or update of maintenance_start_date, last_maintenance_date, maintenance_subscription
on public.elevators
for each row execute function public.calculate_elevator_next_maintenance();

create or replace function public.sync_elevator_last_maintenance()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.elevators
  set last_maintenance_date = new.visit_date
  where id = new.elevator_id
    and (last_maintenance_date is null or new.visit_date >= last_maintenance_date);
  return new;
end;
$$;

drop trigger if exists maintenance_sync_elevator_date on public.maintenance;
create trigger maintenance_sync_elevator_date
after insert or update of visit_date, elevator_id
on public.maintenance
for each row execute function public.sync_elevator_last_maintenance();

-- Backfill the latest visit already stored for every elevator.
update public.elevators as elevator
set last_maintenance_date = latest.visit_date
from (
  select elevator_id, max(visit_date) as visit_date
  from public.maintenance
  group by elevator_id
) as latest
where elevator.id = latest.elevator_id
  and (elevator.last_maintenance_date is null or latest.visit_date >= elevator.last_maintenance_date);

-- Recalculate due dates for existing elevators even if they have no visits yet.
update public.elevators
set maintenance_subscription = maintenance_subscription;

create index if not exists elevators_next_maintenance_date_idx
  on public.elevators(next_maintenance_date);

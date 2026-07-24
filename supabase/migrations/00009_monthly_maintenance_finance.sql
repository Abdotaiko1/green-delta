-- Monthly maintenance plan, completion status, and per-elevator financial ledger.
-- Run once after 00008_elevator_maintenance_contracts.sql.

alter table public.maintenance
  add column if not exists status text not null default 'مجدولة',
  add column if not exists price numeric not null default 0,
  add column if not exists completed_at timestamptz;

alter table public.maintenance
  drop constraint if exists maintenance_status_check;
alter table public.maintenance
  add constraint maintenance_status_check
  check (status in ('مجدولة', 'تمت', 'ملغاة'));

alter table public.maintenance
  drop constraint if exists maintenance_price_check;
alter table public.maintenance
  add constraint maintenance_price_check check (price >= 0);

-- Old visit records represent work that was already performed.
update public.maintenance as maintenance
set status = 'تمت',
    completed_at = coalesce(maintenance.completed_at, maintenance.created_at),
    price = case
      when maintenance.price = 0 then coalesce(elevator.maintenance_price, 0)
      else maintenance.price
    end
from public.elevators as elevator
where elevator.id = maintenance.elevator_id
  and maintenance.status = 'مجدولة';

create table if not exists public.elevator_financial_entries (
  id uuid primary key default gen_random_uuid(),
  elevator_id uuid not null references public.elevators(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  entry_date date not null default current_date,
  entry_type text not null check (entry_type in ('إيراد', 'مصروف')),
  category text not null,
  description text,
  amount numeric not null default 0 check (amount >= 0),
  maintenance_id uuid unique references public.maintenance(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists elevator_financial_entries_elevator_date_idx
  on public.elevator_financial_entries(elevator_id, entry_date desc);
create index if not exists elevator_financial_entries_building_date_idx
  on public.elevator_financial_entries(building_id, entry_date desc);

alter table public.elevator_financial_entries enable row level security;
grant select, insert, update, delete on public.elevator_financial_entries to anon, authenticated;

drop policy if exists "Local app full access elevator financial entries" on public.elevator_financial_entries;
create policy "Local app full access elevator financial entries"
on public.elevator_financial_entries
for all to anon, authenticated using (true) with check (true);

create or replace function public.sync_maintenance_revenue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'تمت' then
    insert into public.elevator_financial_entries (
      elevator_id, building_id, entry_date, entry_type, category,
      description, amount, maintenance_id
    ) values (
      new.elevator_id, new.building_id, new.visit_date, 'إيراد', 'صيانة',
      'إيراد صيانة دورية', coalesce(new.price, 0), new.id
    )
    on conflict (maintenance_id) do update
      set elevator_id = excluded.elevator_id,
          building_id = excluded.building_id,
          entry_date = excluded.entry_date,
          amount = excluded.amount,
          description = excluded.description;
  else
    delete from public.elevator_financial_entries
    where maintenance_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists maintenance_sync_revenue on public.maintenance;
create trigger maintenance_sync_revenue
after insert or update of status, price, visit_date, elevator_id, building_id
on public.maintenance
for each row execute function public.sync_maintenance_revenue();

-- Only completed visits change the elevator's last and next maintenance dates.
create or replace function public.sync_elevator_last_maintenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'تمت' then
    update public.elevators
    set last_maintenance_date = new.visit_date
    where id = new.elevator_id
      and (last_maintenance_date is null or new.visit_date >= last_maintenance_date);
  end if;
  return new;
end;
$$;

drop trigger if exists maintenance_sync_elevator_date on public.maintenance;
create trigger maintenance_sync_elevator_date
after insert or update of visit_date, elevator_id, status
on public.maintenance
for each row execute function public.sync_elevator_last_maintenance();

-- Create the initial financial ledger from completed maintenance already stored.
insert into public.elevator_financial_entries (
  elevator_id, building_id, entry_date, entry_type, category,
  description, amount, maintenance_id
)
select
  maintenance.elevator_id, maintenance.building_id, maintenance.visit_date,
  'إيراد', 'صيانة', 'إيراد صيانة دورية', maintenance.price, maintenance.id
from public.maintenance as maintenance
where maintenance.status = 'تمت'
on conflict (maintenance_id) do update
set amount = excluded.amount,
    entry_date = excluded.entry_date,
    elevator_id = excluded.elevator_id,
    building_id = excluded.building_id;


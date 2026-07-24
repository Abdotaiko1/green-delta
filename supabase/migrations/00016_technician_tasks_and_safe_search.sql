-- Manager-created technician tasks and a finance-free building search for technicians.

create table if not exists public.technician_tasks (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null references public.technicians(id) on delete cascade,
  task_type text not null check (task_type in ('عطل', 'صيانة')),
  target_type text not null check (target_type in ('خط', 'مصعد')),
  maintenance_line_id uuid references public.maintenance_lines(id) on delete cascade,
  elevator_id uuid references public.elevators(id) on delete cascade,
  notes text,
  status text not null default 'مكلف' check (status in ('مكلف', 'تمت')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint technician_tasks_target_check check (
    (target_type = 'خط' and maintenance_line_id is not null and elevator_id is null)
    or
    (target_type = 'مصعد' and elevator_id is not null and maintenance_line_id is null)
  )
);

create index if not exists technician_tasks_technician_idx on public.technician_tasks(technician_id);
create index if not exists technician_tasks_type_idx on public.technician_tasks(task_type);
create index if not exists technician_tasks_line_idx on public.technician_tasks(maintenance_line_id);
create index if not exists technician_tasks_elevator_idx on public.technician_tasks(elevator_id);

alter table public.technician_tasks enable row level security;
grant select, insert, update, delete on public.technician_tasks to authenticated;
revoke all on public.technician_tasks from anon;

drop policy if exists "technician tasks manager all" on public.technician_tasks;
drop policy if exists "technician tasks own read" on public.technician_tasks;

create policy "technician tasks manager all"
on public.technician_tasks for all to authenticated
using (public.current_app_role() = 'manager')
with check (public.current_app_role() = 'manager');

create policy "technician tasks own read"
on public.technician_tasks for select to authenticated
using (
  public.current_app_role() = 'technician'
  and technician_id = public.current_technician_id()
);

-- Returns only non-financial building details. It intentionally bypasses the
-- normal building RLS so a technician can search any building by name/address.
create or replace function public.search_buildings_basic(search_text text)
returns table (
  id uuid,
  name text,
  address text,
  maintenance_line_name text,
  is_assigned boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    building.id,
    building.name,
    building.address,
    line.name as maintenance_line_name,
    case
      when public.current_app_role() = 'manager' then true
      else public.technician_has_building(building.id)
    end as is_assigned
  from public.buildings as building
  left join public.maintenance_lines as line on line.id = building.maintenance_line_id
  where public.current_app_role() in ('manager', 'technician')
    and (
      coalesce(trim(search_text), '') = ''
      or building.name ilike '%' || trim(search_text) || '%'
      or coalesce(building.address, '') ilike '%' || trim(search_text) || '%'
    )
  order by building.name
  limit 20;
$$;

revoke all on function public.search_buildings_basic(text) from public, anon;
grant execute on function public.search_buildings_basic(text) to authenticated;

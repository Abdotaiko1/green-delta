-- Treat an active line/elevator task as an operational building assignment.

create or replace function public.technician_has_building(target_building_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.technician_buildings as assignment
      where assignment.technician_id = public.current_technician_id()
        and assignment.building_id = target_building_id
    )
    or exists (
      select 1
      from public.technician_tasks as task
      where task.technician_id = public.current_technician_id()
        and task.status = 'مكلف'
        and (
          exists (
            select 1 from public.elevators as elevator
            where elevator.id = task.elevator_id
              and elevator.building_id = target_building_id
          )
          or exists (
            select 1 from public.buildings as building
            where building.id = target_building_id
              and building.maintenance_line_id = task.maintenance_line_id
          )
        )
    );
$$;

grant select, insert on public.oil_records to authenticated;
grant select, insert on public.maintenance to authenticated;

drop policy if exists "role oil technician insert" on public.oil_records;
create policy "role oil technician insert"
on public.oil_records for insert to authenticated
with check (
  public.current_app_role() = 'technician'
  and public.technician_has_building(building_id)
  and (
    oil_records.elevator_id is null
    or exists (
      select 1 from public.elevators as elevator
      where elevator.id = oil_records.elevator_id
        and elevator.building_id = oil_records.building_id
    )
  )
);

drop policy if exists "role maintenance technician update" on public.maintenance;
drop policy if exists "role maintenance technician insert" on public.maintenance;
create policy "role maintenance technician insert"
on public.maintenance for insert to authenticated
with check (
  public.current_app_role() = 'technician'
  and public.technician_has_building(building_id)
  and technician_id = public.current_technician_id()
  and status = 'تمت'
  and exists (
    select 1 from public.elevators as elevator
    where elevator.id = maintenance.elevator_id
      and elevator.building_id = maintenance.building_id
  )
);

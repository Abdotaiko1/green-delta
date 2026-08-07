-- Enforce each building's configured elevator capacity and allow an authorized
-- user to permanently delete an archived building with all related history.

create or replace function public.enforce_building_elevator_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  allowed_count integer;
  registered_count integer;
begin
  -- Archived elevators do not consume an active slot.
  if new.archived_at is not null then
    return new;
  end if;

  select greatest(coalesce(building.elevator_count, 0), 0)
  into allowed_count
  from public.buildings as building
  where building.id = new.building_id
  for update;

  if allowed_count is null then
    raise exception 'المبنى المحدد غير موجود';
  end if;

  select count(*)::integer
  into registered_count
  from public.elevators as elevator
  where elevator.building_id = new.building_id
    and elevator.archived_at is null
    and elevator.id is distinct from new.id;

  if registered_count >= allowed_count then
    raise exception 'هذا المبنى مسجل له % مصعد فقط، وتم تسجيل العدد بالكامل', allowed_count;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_building_elevator_limit_on_elevators on public.elevators;
create trigger enforce_building_elevator_limit_on_elevators
before insert or update of building_id, archived_at
on public.elevators
for each row execute function public.enforce_building_elevator_limit();

create or replace function public.prevent_invalid_building_elevator_count()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  registered_count integer;
begin
  select count(*)::integer
  into registered_count
  from public.elevators as elevator
  where elevator.building_id = new.id
    and elevator.archived_at is null;

  if new.elevator_count < registered_count then
    raise exception 'لا يمكن تقليل عدد المصاعد إلى % لأن المبنى يحتوي حاليًا على % مصعد',
      new.elevator_count, registered_count;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_building_elevator_count on public.buildings;
create trigger validate_building_elevator_count
before update of elevator_count
on public.buildings
for each row execute function public.prevent_invalid_building_elevator_count();

create or replace function public.permanently_delete_archived_building(
  p_building_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_building public.buildings%rowtype;
begin
  if auth.uid() is null or not public.has_app_permission('buildings', 'delete') then
    raise exception 'غير مسموح بالحذف النهائي للمباني';
  end if;

  select *
  into target_building
  from public.buildings
  where id = p_building_id
  for update;

  if target_building.id is null then
    raise exception 'المبنى غير موجود';
  end if;
  if target_building.archived_at is null then
    raise exception 'يجب أرشفة المبنى قبل حذفه نهائيًا';
  end if;

  -- Invoice foreign keys intentionally use RESTRICT, so remove the archived
  -- building's invoices first. Invoice items are removed by CASCADE.
  delete from public.maintenance_invoices
  where building_id = p_building_id;

  -- Elevators and all operational/financial history use CASCADE from the
  -- building/elevators and are deleted together with the archived building.
  delete from public.buildings
  where id = p_building_id;
end;
$$;

revoke all on function public.permanently_delete_archived_building(uuid) from public, anon;
grant execute on function public.permanently_delete_archived_building(uuid) to authenticated;

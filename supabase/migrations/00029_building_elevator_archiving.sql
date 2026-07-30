-- Safe archiving for buildings and elevators.
-- Financial, maintenance, fault, oil and spare-part history remains untouched.

alter table public.buildings
  add column if not exists archived_at timestamptz;

alter table public.elevators
  add column if not exists archived_at timestamptz;

create index if not exists buildings_archived_at_idx
  on public.buildings (archived_at);

create index if not exists elevators_archived_at_idx
  on public.elevators (archived_at);

create or replace function public.set_elevator_archived(
  p_elevator_id uuid,
  p_archived boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_app_permission('elevators', 'delete') then
    raise exception 'غير مسموح بأرشفة المصاعد';
  end if;

  update public.elevators
  set archived_at = case when p_archived then now() else null end
  where id = p_elevator_id;

  if not found then
    raise exception 'المصعد غير موجود';
  end if;
end;
$$;

create or replace function public.set_building_archived(
  p_building_id uuid,
  p_archived boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_app_permission('buildings', 'delete') then
    raise exception 'غير مسموح بأرشفة المباني';
  end if;

  update public.buildings
  set archived_at = case when p_archived then now() else null end
  where id = p_building_id;

  if not found then
    raise exception 'المبنى غير موجود';
  end if;

  update public.elevators
  set archived_at = case when p_archived then now() else null end
  where building_id = p_building_id;
end;
$$;

revoke all on function public.set_elevator_archived(uuid, boolean) from public, anon;
revoke all on function public.set_building_archived(uuid, boolean) from public, anon;
grant execute on function public.set_elevator_archived(uuid, boolean) to authenticated;
grant execute on function public.set_building_archived(uuid, boolean) to authenticated;

-- Archived buildings/elevators must not receive new monthly invoices.
create or replace function public.generate_monthly_maintenance_invoices(p_month date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_month date := date_trunc('month', coalesce(p_month, current_date))::date;
  inserted_count integer;
begin
  if auth.uid() is not null and (not public.has_app_permission('maintenance', 'view') or public.current_app_role() = 'technician') then
    raise exception 'غير مسموح بعرض فواتير الصيانة';
  end if;
  if target_month > date_trunc('month', current_date)::date then
    raise exception 'لا يمكن إصدار فاتورة شهر مستقبلي قبل بدايته';
  end if;

  insert into public.maintenance_invoices(
    invoice_number, invoice_month, building_id, elevators_count, amount
  )
  select
    'MN-' || to_char(target_month, 'YYYYMM') || '-' || upper(replace(building.id::text, '-', '')),
    target_month,
    building.id,
    count(elevator.id)::integer,
    coalesce(sum(coalesce(elevator.maintenance_price, 0)), 0)
  from public.buildings as building
  join public.elevators as elevator on elevator.building_id = building.id
  where building.archived_at is null
    and elevator.archived_at is null
    and (
      elevator.maintenance_start_date is null
      or elevator.maintenance_start_date < (target_month + interval '1 month')::date
    )
  group by building.id
  on conflict (building_id, invoice_month) do nothing;

  get diagnostics inserted_count = row_count;

  insert into public.maintenance_invoice_items(invoice_id, elevator_id, amount)
  select invoice.id, elevator.id, coalesce(elevator.maintenance_price, 0)
  from public.maintenance_invoices as invoice
  join public.buildings as building on building.id = invoice.building_id
  join public.elevators as elevator on elevator.building_id = invoice.building_id
  where invoice.invoice_month = target_month
    and invoice.status = 'غير محصلة'
    and building.archived_at is null
    and elevator.archived_at is null
    and (
      elevator.maintenance_start_date is null
      or elevator.maintenance_start_date < (target_month + interval '1 month')::date
    )
  on conflict (invoice_id, elevator_id) do nothing;

  update public.maintenance_invoices as invoice
  set elevators_count = totals.elevators_count,
      amount = totals.amount
  from (
    select item.invoice_id, count(*)::integer as elevators_count, sum(item.amount) as amount
    from public.maintenance_invoice_items as item
    group by item.invoice_id
  ) as totals
  where invoice.id = totals.invoice_id
    and invoice.invoice_month = target_month
    and invoice.status = 'غير محصلة';

  return inserted_count;
end;
$$;

revoke all on function public.generate_monthly_maintenance_invoices(date) from public, anon;
grant execute on function public.generate_monthly_maintenance_invoices(date) to authenticated;

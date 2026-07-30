-- Multiple monthly maintenance visits with optional collection per visit.
-- Run after 00030_oil_schedule_and_account_permissions.sql.

create or replace function public.sync_maintenance_revenue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start date;
  month_end date;
begin
  if tg_op = 'DELETE' then
    delete from public.elevator_financial_entries
    where maintenance_id = old.id
       or (source_type = 'maintenance_visit' and source_id = old.id);
    return old;
  end if;

  -- Rebuild only the financial row belonging to this visit.
  delete from public.elevator_financial_entries
  where maintenance_id = new.id
     or (source_type = 'maintenance_visit' and source_id = new.id);

  if new.status = 'تمت'
     and new.payment_collected
     and coalesce(new.price, 0) > 0 then
    month_start := date_trunc('month', new.visit_date)::date;
    month_end := (month_start + interval '1 month')::date;

    -- A second visit is allowed, but the monthly maintenance price must never
    -- be added to revenue twice for the same elevator.
    if exists (
      select 1
      from public.elevator_financial_entries as entry
      where entry.elevator_id = new.elevator_id
        and entry.entry_type = 'إيراد'
        and entry.category in ('صيانة', 'تحصيل صيانة')
        and entry.entry_date >= month_start
        and entry.entry_date < month_end
    ) then
      raise exception 'تم تحصيل صيانة هذا المصعد لهذا الشهر بالفعل. سجل الزيارة الجديدة بدون تحصيل';
    end if;

    insert into public.elevator_financial_entries(
      elevator_id, building_id, entry_date, entry_type, category,
      description, amount, maintenance_id, source_type, source_id,
      technician_id, created_by
    )
    values(
      new.elevator_id, new.building_id, new.visit_date, 'إيراد', 'تحصيل صيانة',
      'تحصيل زيارة صيانة بتاريخ ' || to_char(new.visit_date, 'YYYY-MM-DD'),
      new.price, new.id, 'maintenance_visit', new.id,
      new.technician_id, auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists maintenance_sync_revenue on public.maintenance;
create trigger maintenance_sync_revenue
after insert or update of status, price, visit_date, elevator_id, building_id,
  payment_collected, technician_id or delete
on public.maintenance
for each row execute function public.sync_maintenance_revenue();

drop function if exists public.complete_maintenance_visit(uuid, date, uuid, text, boolean);
create function public.complete_maintenance_visit(
  p_elevator_id uuid,
  p_visit_date date,
  p_technician_id uuid,
  p_notes text,
  p_payment_collected boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_elevator public.elevators%rowtype;
  selected_technician_id uuid;
  new_maintenance_id uuid;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;
  if not public.has_app_permission('maintenance', 'update') then
    raise exception 'غير مسموح بإتمام الصيانة';
  end if;
  if p_visit_date is null then
    raise exception 'اختر تاريخ الزيارة';
  end if;
  if p_visit_date > current_date then
    raise exception 'لا يمكن إتمام زيارة بتاريخ مستقبلي';
  end if;

  select *
  into target_elevator
  from public.elevators
  where id = p_elevator_id;

  if target_elevator.id is null then
    raise exception 'المصعد غير موجود';
  end if;

  if public.current_app_role() = 'technician' then
    selected_technician_id := public.current_technician_id();
    if selected_technician_id is null then
      raise exception 'حساب تسجيل الدخول غير مربوط بفني';
    end if;
  else
    selected_technician_id := p_technician_id;
    if selected_technician_id is null then
      raise exception 'اختر الفني الذي نفذ الزيارة';
    end if;
  end if;

  if not exists (
    select 1 from public.technicians
    where id = selected_technician_id
  ) then
    raise exception 'الفني المختار غير موجود';
  end if;

  insert into public.maintenance(
    type, building_id, elevator_id, visit_date, technician_id, notes,
    status, price, completed_at, payment_collected
  )
  values(
    'دورية', target_elevator.building_id, target_elevator.id, p_visit_date,
    selected_technician_id, nullif(trim(coalesce(p_notes, '')), ''),
    'تمت', coalesce(target_elevator.maintenance_price, 0), now(),
    coalesce(p_payment_collected, false)
  )
  returning id into new_maintenance_id;

  return new_maintenance_id;
end;
$$;

revoke all on function public.complete_maintenance_visit(uuid, date, uuid, text, boolean)
from public, anon;
grant execute on function public.complete_maintenance_visit(uuid, date, uuid, text, boolean)
to authenticated;

-- Keep the old technician RPC compatible with older deployed app versions.
drop function if exists public.technician_complete_maintenance(uuid, date, text, boolean);
create function public.technician_complete_maintenance(
  p_elevator_id uuid,
  p_visit_date date,
  p_notes text,
  p_payment_collected boolean
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.complete_maintenance_visit(
    p_elevator_id,
    p_visit_date,
    null::uuid,
    p_notes,
    p_payment_collected
  );
$$;

revoke all on function public.technician_complete_maintenance(uuid, date, text, boolean)
from public, anon;
grant execute on function public.technician_complete_maintenance(uuid, date, text, boolean)
to authenticated;

-- Collecting the whole building invoice adds only elevator amounts that were
-- not already collected from a completed visit in the same month.
create or replace function public.collect_maintenance_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice public.maintenance_invoices%rowtype;
  collector_name text;
begin
  if not public.has_app_permission('maintenance', 'update') then
    raise exception 'غير مسموح بتحصيل فاتورة الصيانة';
  end if;

  select *
  into invoice
  from public.maintenance_invoices
  where id = p_invoice_id
  for update;

  if invoice.id is null then
    raise exception 'الفاتورة غير موجودة';
  end if;
  if invoice.status = 'تم التحصيل' then
    return;
  end if;

  select full_name into collector_name
  from public.users
  where id = auth.uid();

  insert into public.elevator_financial_entries(
    building_id, elevator_id, entry_date, entry_type, category, description,
    amount, source_type, source_id, invoice_number, created_by
  )
  select
    invoice.building_id,
    item.elevator_id,
    current_date,
    'إيراد',
    'تحصيل صيانة',
    'تحصيل فاتورة صيانة شهر ' || to_char(invoice.invoice_month, 'YYYY-MM'),
    item.amount,
    'maintenance_invoice',
    item.id,
    invoice.invoice_number,
    auth.uid()
  from public.maintenance_invoice_items as item
  where item.invoice_id = invoice.id
    and not exists (
      select 1
      from public.elevator_financial_entries as entry
      where entry.elevator_id = item.elevator_id
        and entry.entry_type = 'إيراد'
        and entry.category in ('صيانة', 'تحصيل صيانة')
        and entry.entry_date >= invoice.invoice_month
        and entry.entry_date < (invoice.invoice_month + interval '1 month')::date
    )
  on conflict (source_type, source_id, entry_type)
    where source_id is not null
  do nothing;

  update public.maintenance_invoices
  set status = 'تم التحصيل',
      collected_at = now(),
      collected_by = auth.uid(),
      collected_by_name = coalesce(collector_name, 'مستخدم')
  where id = invoice.id;
end;
$$;

revoke all on function public.collect_maintenance_invoice(uuid) from public, anon;
grant execute on function public.collect_maintenance_invoice(uuid) to authenticated;


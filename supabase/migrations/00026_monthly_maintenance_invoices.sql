-- One monthly maintenance invoice per building, generated from elevator maintenance prices.

create table if not exists public.maintenance_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  invoice_month date not null check (invoice_month = date_trunc('month', invoice_month)::date),
  building_id uuid not null references public.buildings(id) on delete restrict,
  elevators_count integer not null default 0 check (elevators_count >= 0),
  amount numeric not null default 0 check (amount >= 0),
  status text not null default 'غير محصلة' check (status in ('غير محصلة', 'تم التحصيل')),
  collected_at timestamptz,
  collected_by uuid references auth.users(id) on delete set null,
  collected_by_name text,
  created_at timestamptz not null default now(),
  unique (building_id, invoice_month)
);

create index if not exists maintenance_invoices_month_idx
  on public.maintenance_invoices(invoice_month desc, status);
create index if not exists maintenance_invoices_building_idx
  on public.maintenance_invoices(building_id, invoice_month desc);

create table if not exists public.maintenance_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.maintenance_invoices(id) on delete cascade,
  elevator_id uuid not null references public.elevators(id) on delete restrict,
  amount numeric not null default 0 check (amount >= 0),
  unique (invoice_id, elevator_id)
);

alter table public.maintenance_invoices enable row level security;
alter table public.maintenance_invoice_items enable row level security;
grant select on public.maintenance_invoices to authenticated;
grant select on public.maintenance_invoice_items to authenticated;
revoke all on public.maintenance_invoices from anon;
revoke all on public.maintenance_invoice_items from anon;

drop policy if exists "maintenance invoices view" on public.maintenance_invoices;
create policy "maintenance invoices view" on public.maintenance_invoices for select to authenticated
using (public.has_app_permission('maintenance', 'view') and public.current_app_role() <> 'technician');

drop policy if exists "maintenance invoice items view" on public.maintenance_invoice_items;
create policy "maintenance invoice items view" on public.maintenance_invoice_items for select to authenticated
using (public.has_app_permission('maintenance', 'view') and public.current_app_role() <> 'technician');

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
  where elevator.maintenance_start_date is null
     or elevator.maintenance_start_date < (target_month + interval '1 month')::date
  group by building.id
  on conflict (building_id, invoice_month) do nothing;

  get diagnostics inserted_count = row_count;

  insert into public.maintenance_invoice_items(invoice_id, elevator_id, amount)
  select invoice.id, elevator.id, coalesce(elevator.maintenance_price, 0)
  from public.maintenance_invoices as invoice
  join public.elevators as elevator on elevator.building_id = invoice.building_id
  where invoice.invoice_month = target_month
    and invoice.status = 'غير محصلة'
    and (elevator.maintenance_start_date is null
      or elevator.maintenance_start_date < (target_month + interval '1 month')::date)
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

  select * into invoice from public.maintenance_invoices where id = p_invoice_id for update;
  if invoice.id is null then raise exception 'الفاتورة غير موجودة'; end if;
  if invoice.status = 'تم التحصيل' then return; end if;

  select full_name into collector_name from public.users where id = auth.uid();
  update public.maintenance_invoices
  set status = 'تم التحصيل', collected_at = now(), collected_by = auth.uid(),
      collected_by_name = coalesce(collector_name, 'مستخدم')
  where id = invoice.id;

  insert into public.elevator_financial_entries(
    building_id, elevator_id, entry_date, entry_type, category, description,
    amount, source_type, source_id, invoice_number, created_by
  )
  select
    invoice.building_id, item.elevator_id, current_date, 'إيراد', 'تحصيل صيانة',
    'تحصيل فاتورة صيانة شهر ' || to_char(invoice.invoice_month, 'YYYY-MM'),
    item.amount, 'maintenance_invoice', item.id, invoice.invoice_number, auth.uid()
  from public.maintenance_invoice_items as item
  where item.invoice_id = invoice.id
  on conflict (source_type, source_id, entry_type) where source_id is not null do nothing;
end;
$$;

revoke all on function public.collect_maintenance_invoice(uuid) from public, anon;
grant execute on function public.collect_maintenance_invoice(uuid) to authenticated;

-- If pg_cron is enabled in Supabase, issue the new month automatically at
-- 00:05 UTC on day 1. The application also runs the same idempotent function
-- on login/open, so invoices are still generated safely when pg_cron is off.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'generate-monthly-maintenance-invoices',
      '5 0 1 * *',
      $job$select public.generate_monthly_maintenance_invoices(current_date);$job$
    );
  end if;
end;
$$;

-- Add this table to the audit trail when the audit migration is installed.
do $$
begin
  if to_regclass('public.audit_logs') is not null then
    drop trigger if exists audit_changes on public.maintenance_invoices;
    create trigger audit_changes after insert or update or delete on public.maintenance_invoices
    for each row execute function public.capture_audit_log();
  end if;
end;
$$;

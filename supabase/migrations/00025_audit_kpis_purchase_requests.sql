-- Audit trail, manager KPIs support, and inventory purchase requests.

-- Inventory replenishment controls.
alter table public.inventory
  add column if not exists minimum_stock integer not null default 5,
  add column if not exists last_purchase_at timestamptz;

alter table public.inventory drop constraint if exists inventory_minimum_stock_check;
alter table public.inventory add constraint inventory_minimum_stock_check check (minimum_stock >= 0);

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventory(id) on delete restrict,
  requested_quantity integer not null check (requested_quantity > 0),
  supplier text,
  unit_price numeric not null default 0 check (unit_price >= 0),
  status text not null default 'مطلوب' check (status in ('مطلوب', 'تم الطلب', 'تم الاستلام', 'ملغي')),
  notes text,
  requested_by uuid references auth.users(id) on delete set null default auth.uid(),
  received_by uuid references auth.users(id) on delete set null,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchase_requests_status_idx on public.purchase_requests(status, created_at desc);
create index if not exists purchase_requests_inventory_idx on public.purchase_requests(inventory_id);

create or replace function public.apply_received_purchase_request()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.updated_at := now();
  if old.status = 'تم الاستلام' and new.status is distinct from old.status then
    raise exception 'لا يمكن تغيير حالة طلب تم استلامه';
  end if;
  if new.status = 'تم الاستلام' and old.status is distinct from 'تم الاستلام' then
    update public.inventory
    set quantity = quantity + new.requested_quantity,
        purchase_price = case when new.unit_price > 0 then new.unit_price else purchase_price end,
        supplier = coalesce(nullif(trim(new.supplier), ''), supplier),
        last_purchase_at = now()
    where id = new.inventory_id;
    new.received_by := auth.uid();
    new.received_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_request_receive_stock on public.purchase_requests;
create trigger purchase_request_receive_stock
before update on public.purchase_requests
for each row execute function public.apply_received_purchase_request();

alter table public.purchase_requests enable row level security;
grant select, insert, update, delete on public.purchase_requests to authenticated;
revoke all on public.purchase_requests from anon;

drop policy if exists "purchase requests view" on public.purchase_requests;
drop policy if exists "purchase requests create" on public.purchase_requests;
drop policy if exists "purchase requests update" on public.purchase_requests;
drop policy if exists "purchase requests delete" on public.purchase_requests;
create policy "purchase requests view" on public.purchase_requests for select to authenticated
using (public.has_app_permission('inventory', 'view'));
create policy "purchase requests create" on public.purchase_requests for insert to authenticated
with check (public.has_app_permission('inventory', 'create'));
create policy "purchase requests update" on public.purchase_requests for update to authenticated
using (public.has_app_permission('inventory', 'update')) with check (public.has_app_permission('inventory', 'update'));
create policy "purchase requests delete" on public.purchase_requests for delete to authenticated
using (public.has_app_permission('inventory', 'delete'));

-- Add Audit Log as a configurable module.
alter table public.role_permissions drop constraint if exists role_permissions_resource_check;
alter table public.role_permissions add constraint role_permissions_resource_check check (resource in (
  'dashboard', 'buildings', 'elevators', 'customers', 'technicians', 'faults',
  'maintenance', 'inventory', 'oil', 'spare_parts', 'finance', 'reports',
  'attendance', 'audit_log'
));

insert into public.role_permissions(role, resource, can_view, can_create, can_update, can_delete)
values ('manager', 'audit_log', true, false, false, false)
on conflict (role, resource) do nothing;

insert into public.role_permissions(role, resource)
select role_name, 'audit_log'
from unnest(enum_range(null::public.user_role)) as roles(role_name)
on conflict (role, resource) do nothing;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  action text not null check (action in ('إضافة', 'تعديل', 'حذف')),
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs add column if not exists user_name text;

create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_user_idx on public.audit_logs(user_id, created_at desc);
create index if not exists audit_logs_table_idx on public.audit_logs(table_name, created_at desc);

create or replace function public.capture_audit_log()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  previous_data jsonb;
  current_data jsonb;
begin
  previous_data := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  current_data := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;

  insert into public.audit_logs(user_id, user_name, action, table_name, record_id, old_data, new_data)
  values(
    auth.uid(),
    coalesce((select full_name from public.users where id = auth.uid()), 'النظام'),
    case tg_op when 'INSERT' then 'إضافة' when 'UPDATE' then 'تعديل' else 'حذف' end,
    tg_table_name,
    coalesce(current_data ->> 'id', previous_data ->> 'id'),
    previous_data,
    current_data
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

alter table public.audit_logs enable row level security;
grant select on public.audit_logs to authenticated;
revoke insert, update, delete on public.audit_logs from authenticated, anon;
revoke all on public.audit_logs from anon;

drop policy if exists "audit log configurable view" on public.audit_logs;
create policy "audit log configurable view" on public.audit_logs for select to authenticated
using (public.has_app_permission('audit_log', 'view'));

do $$
declare item record;
begin
  for item in select table_name from (values
    ('buildings'), ('elevators'), ('customers'), ('technicians'), ('faults'),
    ('maintenance'), ('maintenance_lines'), ('inventory'), ('oil_records'),
    ('spare_part_replacements'), ('elevator_financial_entries'),
    ('technician_tasks'), ('technician_buildings'), ('purchase_requests')
  ) as tracked(table_name)
  loop
    if to_regclass('public.' || item.table_name) is not null then
      execute format('drop trigger if exists audit_changes on public.%I', item.table_name);
      execute format(
        'create trigger audit_changes after insert or update or delete on public.%I for each row execute function public.capture_audit_log()',
        item.table_name
      );
    end if;
  end loop;
end;
$$;

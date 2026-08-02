-- Elevator legacy history, invoice price synchronization, and disabling spare-part finance sync.

create table if not exists public.elevator_legacy_records (
  id uuid primary key default gen_random_uuid(),
  elevator_id uuid not null references public.elevators(id) on delete cascade,
  record_date date not null default current_date,
  record_type text not null check (record_type in ('عطل', 'تغيير قطعة غيار', 'ملاحظة')),
  title text not null check (length(trim(title)) > 0),
  details text,
  part_name text,
  price numeric not null default 0 check (price >= 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

comment on table public.elevator_legacy_records is
  'سجل تاريخي يدوي للمصعد، ولا ينشئ أي حركة مالية أو مخزنية.';

create index if not exists elevator_legacy_records_elevator_date_idx
  on public.elevator_legacy_records(elevator_id, record_date desc, created_at desc);

alter table public.elevator_legacy_records enable row level security;

drop policy if exists "legacy records view" on public.elevator_legacy_records;
drop policy if exists "legacy records create" on public.elevator_legacy_records;
drop policy if exists "legacy records update" on public.elevator_legacy_records;
drop policy if exists "legacy records delete" on public.elevator_legacy_records;

create policy "legacy records view"
on public.elevator_legacy_records for select to authenticated
using (public.has_app_permission('elevators', 'view'));

create policy "legacy records create"
on public.elevator_legacy_records for insert to authenticated
with check (public.has_app_permission('elevators', 'update'));

create policy "legacy records update"
on public.elevator_legacy_records for update to authenticated
using (public.has_app_permission('elevators', 'update'))
with check (public.has_app_permission('elevators', 'update'));

create policy "legacy records delete"
on public.elevator_legacy_records for delete to authenticated
using (public.has_app_permission('elevators', 'delete'));

grant select, insert, update, delete on public.elevator_legacy_records to authenticated;
revoke all on public.elevator_legacy_records from anon;

-- Spare-part replacements remain recorded and still deduct stock, but never affect finance.
drop trigger if exists spare_parts_sync_finance on public.spare_part_replacements;
delete from public.elevator_financial_entries where source_type = 'spare_part';

-- When the elevator maintenance price changes, update every still-uncollected invoice item.
-- Collected invoices are intentionally kept unchanged as an accounting snapshot.
create or replace function public.sync_elevator_uncollected_invoice_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.maintenance_price is not distinct from old.maintenance_price then
    return new;
  end if;

  update public.maintenance_invoice_items as item
  set amount = coalesce(new.maintenance_price, 0)
  from public.maintenance_invoices as invoice
  where item.invoice_id = invoice.id
    and item.elevator_id = new.id
    and invoice.status = 'غير محصلة';

  update public.maintenance_invoices as invoice
  set amount = totals.amount,
      elevators_count = totals.elevators_count
  from (
    select
      item.invoice_id,
      coalesce(sum(item.amount), 0) as amount,
      count(*)::integer as elevators_count
    from public.maintenance_invoice_items as item
    join public.maintenance_invoices as open_invoice on open_invoice.id = item.invoice_id
    where open_invoice.status = 'غير محصلة'
      and exists (
        select 1
        from public.maintenance_invoice_items as changed_item
        where changed_item.invoice_id = item.invoice_id
          and changed_item.elevator_id = new.id
      )
    group by item.invoice_id
  ) as totals
  where invoice.id = totals.invoice_id;

  return new;
end;
$$;

drop trigger if exists elevators_sync_uncollected_invoice_price on public.elevators;
create trigger elevators_sync_uncollected_invoice_price
after update of maintenance_price on public.elevators
for each row execute function public.sync_elevator_uncollected_invoice_price();

revoke all on function public.sync_elevator_uncollected_invoice_price() from public, anon;

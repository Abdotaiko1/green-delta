-- Unified, auditable finance ledger for maintenance, oil, spare parts, salaries and expenses.

alter table public.elevator_financial_entries
  alter column elevator_id drop not null,
  alter column building_id drop not null;

alter table public.elevator_financial_entries
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists technician_id uuid references public.technicians(id) on delete set null,
  add column if not exists invoice_number text,
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid();

create unique index if not exists financial_entries_source_unique
  on public.elevator_financial_entries(source_type, source_id, entry_type)
  where source_id is not null;
create index if not exists financial_entries_date_idx on public.elevator_financial_entries(entry_date desc);
create index if not exists financial_entries_type_category_idx on public.elevator_financial_entries(entry_type, category);

alter table public.oil_records add column if not exists cost_amount numeric not null default 0;
alter table public.oil_records drop constraint if exists oil_records_cost_amount_check;
alter table public.oil_records add constraint oil_records_cost_amount_check check (cost_amount >= 0);

alter table public.spare_part_replacements add column if not exists cost_price numeric not null default 0;
alter table public.spare_part_replacements drop constraint if exists spare_parts_cost_price_check;
alter table public.spare_part_replacements add constraint spare_parts_cost_price_check check (cost_price >= 0);

update public.spare_part_replacements as replacement
set cost_price = coalesce(inventory.purchase_price, 0) * replacement.quantity_used
from public.inventory as inventory
where replacement.inventory_id = inventory.id
  and replacement.cost_price = 0;

-- Capture the real stock purchase cost at the moment a part is used.
create or replace function public.deduct_replacement_from_inventory()
returns trigger language plpgsql security definer set search_path = public
as $$
declare stock_quantity integer; stock_name text; stock_purchase_price numeric;
begin
  if tg_op = 'UPDATE' then
    if new.inventory_id is distinct from old.inventory_id or new.quantity_used is distinct from old.quantity_used then
      raise exception 'لا يمكن تغيير كود أو كمية سجل قديم. احذف السجل وأضفه من جديد';
    end if;
    return new;
  end if;
  if new.inventory_id is null then return new; end if;
  select quantity, part_name, purchase_price into stock_quantity, stock_name, stock_purchase_price
  from public.inventory where id = new.inventory_id for update;
  if not found then raise exception 'كود القطعة غير موجود في المخزن'; end if;
  if stock_quantity < new.quantity_used then raise exception 'الكمية غير كافية. المتاح في المخزن: %', stock_quantity; end if;
  update public.inventory set quantity = quantity - new.quantity_used where id = new.inventory_id;
  new.part_name := stock_name;
  new.cost_price := coalesce(stock_purchase_price, 0) * new.quantity_used;
  return new;
end;
$$;

create or replace function public.sync_oil_finance()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.elevator_financial_entries where source_type = 'oil' and source_id = old.id;
    return old;
  end if;
  delete from public.elevator_financial_entries where source_type = 'oil' and source_id = new.id;
  if coalesce(new.price, 0) > 0 then
    insert into public.elevator_financial_entries(elevator_id, building_id, entry_date, entry_type, category, description, amount, source_type, source_id, created_by)
    values(new.elevator_id, new.building_id, new.change_date, 'إيراد', 'تغيير زيت', 'قيمة تغيير الزيت للعميل', new.price, 'oil', new.id, new.recorded_by);
  end if;
  if coalesce(new.cost_amount, 0) > 0 then
    insert into public.elevator_financial_entries(elevator_id, building_id, entry_date, entry_type, category, description, amount, source_type, source_id, created_by)
    values(new.elevator_id, new.building_id, new.change_date, 'مصروف', 'تكلفة زيت', 'تكلفة الزيت المستخدمة', new.cost_amount, 'oil', new.id, new.recorded_by);
  end if;
  return new;
end;
$$;
drop trigger if exists oil_sync_finance on public.oil_records;
create trigger oil_sync_finance after insert or update or delete
on public.oil_records for each row execute function public.sync_oil_finance();

create or replace function public.sync_spare_part_finance()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.elevator_financial_entries where source_type = 'spare_part' and source_id = old.id;
    return old;
  end if;
  delete from public.elevator_financial_entries where source_type = 'spare_part' and source_id = new.id;
  if coalesce(new.price, 0) > 0 then
    insert into public.elevator_financial_entries(elevator_id, building_id, entry_date, entry_type, category, description, amount, source_type, source_id, technician_id, invoice_number)
    values(new.elevator_id, new.building_id, new.replacement_date, 'إيراد', 'قطع غيار', 'قيمة بيع وتركيب: ' || new.part_name, new.price, 'spare_part', new.id, new.technician_id, new.invoice_number);
  end if;
  if coalesce(new.cost_price, 0) > 0 then
    insert into public.elevator_financial_entries(elevator_id, building_id, entry_date, entry_type, category, description, amount, source_type, source_id, technician_id, invoice_number)
    values(new.elevator_id, new.building_id, new.replacement_date, 'مصروف', 'تكلفة قطع غيار', 'تكلفة القطعة: ' || new.part_name, new.cost_price, 'spare_part', new.id, new.technician_id, new.invoice_number);
  end if;
  return new;
end;
$$;
drop trigger if exists spare_parts_sync_finance on public.spare_part_replacements;
create trigger spare_parts_sync_finance after insert or update or delete
on public.spare_part_replacements for each row execute function public.sync_spare_part_finance();

-- Rebuild automatic oil and spare-part entries for existing records.
delete from public.elevator_financial_entries where source_type in ('oil', 'spare_part');
insert into public.elevator_financial_entries(elevator_id, building_id, entry_date, entry_type, category, description, amount, source_type, source_id, created_by)
select elevator_id, building_id, change_date, 'إيراد', 'تغيير زيت', 'قيمة تغيير الزيت للعميل', price, 'oil', id, recorded_by from public.oil_records where price > 0;
insert into public.elevator_financial_entries(elevator_id, building_id, entry_date, entry_type, category, description, amount, source_type, source_id, created_by)
select elevator_id, building_id, change_date, 'مصروف', 'تكلفة زيت', 'تكلفة الزيت المستخدمة', cost_amount, 'oil', id, recorded_by from public.oil_records where cost_amount > 0;
insert into public.elevator_financial_entries(elevator_id, building_id, entry_date, entry_type, category, description, amount, source_type, source_id, technician_id, invoice_number)
select elevator_id, building_id, replacement_date, 'إيراد', 'قطع غيار', 'قيمة بيع وتركيب: ' || part_name, price, 'spare_part', id, technician_id, invoice_number from public.spare_part_replacements where price > 0;
insert into public.elevator_financial_entries(elevator_id, building_id, entry_date, entry_type, category, description, amount, source_type, source_id, technician_id, invoice_number)
select elevator_id, building_id, replacement_date, 'مصروف', 'تكلفة قطع غيار', 'تكلفة القطعة: ' || part_name, cost_price, 'spare_part', id, technician_id, invoice_number from public.spare_part_replacements where cost_price > 0;

drop policy if exists "role finance manager" on public.elevator_financial_entries;
drop policy if exists "role finance accountant read" on public.elevator_financial_entries;
drop policy if exists "role finance staff all" on public.elevator_financial_entries;
drop policy if exists "Local app full access elevator financial entries" on public.elevator_financial_entries;
create policy "role finance staff all" on public.elevator_financial_entries for all to authenticated
using (public.current_app_role() in ('manager', 'accountant'))
with check (public.current_app_role() in ('manager', 'accountant'));

drop policy if exists "role technicians accountant read" on public.technicians;
create policy "role technicians accountant read" on public.technicians for select to authenticated
using (public.current_app_role() = 'accountant');

grant select, insert, update, delete on public.elevator_financial_entries to authenticated;
revoke all on public.elevator_financial_entries from anon;

-- Updated oil RPC includes actual cost as well as customer price.
drop function if exists public.technician_record_oil(uuid, uuid, text, text, numeric, numeric, date, text);
drop function if exists public.technician_record_oil(uuid, uuid, text, text, numeric, numeric, numeric, date, text);
create function public.technician_record_oil(p_building_id uuid, p_elevator_id uuid, p_oil_type text, p_oil_brand text, p_oil_quantity numeric, p_price numeric, p_cost_amount numeric, p_change_date date, p_notes text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_record_id uuid;
begin
  if public.current_app_role() <> 'technician' or public.current_technician_id() is null then raise exception 'حساب تسجيل الدخول غير مربوط بفني'; end if;
  if not exists(select 1 from public.buildings where id = p_building_id) then raise exception 'المبنى غير موجود'; end if;
  if p_elevator_id is not null and not exists(select 1 from public.elevators where id = p_elevator_id and building_id = p_building_id) then raise exception 'المصعد لا يتبع المبنى المختار'; end if;
  insert into public.oil_records(building_id, elevator_id, oil_type, oil_brand, oil_quantity, price, cost_amount, change_date, next_change_date, notes, recorded_by)
  values(p_building_id, p_elevator_id, trim(p_oil_type), trim(p_oil_brand), greatest(coalesce(p_oil_quantity,0),0), greatest(coalesce(p_price,0),0), greatest(coalesce(p_cost_amount,0),0), p_change_date, (p_change_date + interval '6 months')::date, nullif(trim(coalesce(p_notes,'')),''), auth.uid()) returning id into new_record_id;
  return new_record_id;
end;
$$;
revoke all on function public.technician_record_oil(uuid, uuid, text, text, numeric, numeric, numeric, date, text) from public, anon;
grant execute on function public.technician_record_oil(uuid, uuid, text, text, numeric, numeric, numeric, date, text) to authenticated;

-- Inventory part codes and atomic stock deduction for spare-part replacements.
-- Run once after the previous migrations.

alter table public.inventory add column if not exists part_code text;

update public.inventory
set part_code = 'SP-' || upper(substr(replace(id::text, '-', ''), 1, 8))
where part_code is null or trim(part_code) = '';

alter table public.inventory alter column part_code set not null;
alter table public.inventory drop constraint if exists inventory_part_code_not_blank;
alter table public.inventory add constraint inventory_part_code_not_blank check (length(trim(part_code)) > 0);
create unique index if not exists inventory_part_code_lower_unique on public.inventory(lower(part_code));

create or replace function public.normalize_inventory_part_code()
returns trigger
language plpgsql
as $$
begin
  new.part_code := upper(trim(new.part_code));
  return new;
end;
$$;

drop trigger if exists inventory_normalize_part_code on public.inventory;
create trigger inventory_normalize_part_code
before insert or update of part_code on public.inventory
for each row execute function public.normalize_inventory_part_code();

alter table public.spare_part_replacements
  add column if not exists inventory_id uuid,
  add column if not exists quantity_used integer not null default 1;

alter table public.spare_part_replacements drop constraint if exists spare_part_replacements_inventory_id_fkey;
alter table public.spare_part_replacements
  add constraint spare_part_replacements_inventory_id_fkey
  foreign key (inventory_id) references public.inventory(id) on delete restrict;

alter table public.spare_part_replacements drop constraint if exists spare_part_replacements_quantity_used_check;
alter table public.spare_part_replacements
  add constraint spare_part_replacements_quantity_used_check check (quantity_used > 0);

create index if not exists spare_part_replacements_inventory_id_idx
  on public.spare_part_replacements(inventory_id);

create or replace function public.deduct_replacement_from_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  stock_quantity integer;
  stock_name text;
begin
  if tg_op = 'UPDATE' then
    if new.inventory_id is distinct from old.inventory_id
       or new.quantity_used is distinct from old.quantity_used then
      raise exception 'لا يمكن تغيير كود أو كمية سجل قديم. احذف السجل وأضفه من جديد';
    end if;
    return new;
  end if;

  -- Old/manual records may have no inventory link. New records from the app always do.
  if new.inventory_id is null then
    return new;
  end if;

  select quantity, part_name
  into stock_quantity, stock_name
  from public.inventory
  where id = new.inventory_id
  for update;

  if not found then
    raise exception 'كود القطعة غير موجود في المخزن';
  end if;

  if stock_quantity < new.quantity_used then
    raise exception 'الكمية غير كافية. المتاح في المخزن: %', stock_quantity;
  end if;

  update public.inventory
  set quantity = quantity - new.quantity_used
  where id = new.inventory_id;

  new.part_name := stock_name;
  return new;
end;
$$;

drop trigger if exists spare_parts_deduct_inventory on public.spare_part_replacements;
create trigger spare_parts_deduct_inventory
before insert or update of inventory_id, quantity_used
on public.spare_part_replacements
for each row execute function public.deduct_replacement_from_inventory();

create or replace function public.restore_replacement_to_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.inventory_id is not null then
    update public.inventory
    set quantity = quantity + old.quantity_used
    where id = old.inventory_id;
  end if;
  return old;
end;
$$;

drop trigger if exists spare_parts_restore_inventory on public.spare_part_replacements;
create trigger spare_parts_restore_inventory
after delete on public.spare_part_replacements
for each row execute function public.restore_replacement_to_inventory();


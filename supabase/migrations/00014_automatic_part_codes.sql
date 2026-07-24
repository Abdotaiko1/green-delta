-- Automatic sequential inventory codes: SP0001, SP0002, ...
-- Run once after migration 00013.

create sequence if not exists public.inventory_part_code_seq start 1;

do $$
declare
  last_number bigint;
begin
  select coalesce(max(substring(part_code from '^[A-Z]{2}([0-9]+)$')::bigint), 0)
  into last_number
  from public.inventory
  where part_code ~ '^[A-Z]{2}[0-9]+$';

  perform setval('public.inventory_part_code_seq', greatest(last_number, 1), last_number > 0);
end;
$$;

create or replace function public.normalize_inventory_part_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_code text;
begin
  if new.part_code is null or trim(new.part_code) = '' then
    loop
      generated_code := 'SP' || lpad(nextval('public.inventory_part_code_seq')::text, 4, '0');
      exit when not exists (
        select 1 from public.inventory where lower(part_code) = lower(generated_code)
      );
    end loop;
    new.part_code := generated_code;
  else
    new.part_code := upper(trim(new.part_code));
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_normalize_part_code on public.inventory;
create trigger inventory_normalize_part_code
before insert or update of part_code on public.inventory
for each row execute function public.normalize_inventory_part_code();

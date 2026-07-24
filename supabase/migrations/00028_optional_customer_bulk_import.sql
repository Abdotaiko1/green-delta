-- Excel bulk import: optional customer number and optional month.
-- Required per row: building name, monthly price, and maintenance line.

create or replace function public.import_buildings_and_elevators(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  row_number integer := 1;
  v_building_name text;
  v_customer_number text;
  v_customer_name text;
  v_month text;
  v_month_date date;
  v_price numeric;
  v_elevator_count integer;
  v_line_name text;
  v_address text;
  v_owner text;
  v_customer_id uuid;
  v_building_id uuid;
  v_line_id uuid;
  v_existing_elevators integer;
  v_next_elevator_number integer;
  v_unit_price numeric;
  v_buildings_created integer := 0;
  v_buildings_updated integer := 0;
  v_elevators_created integer := 0;
  v_elevators_updated integer := 0;
  v_updated_this_row integer := 0;
  v_created_this_row integer := 0;
  v_customers_created integer := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if not (
    public.has_app_permission('buildings', 'create')
    and public.has_app_permission('elevators', 'create')
  ) then
    raise exception 'غير مسموح باستيراد المباني والمصاعد';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'ملف الاستيراد غير صالح';
  end if;

  if jsonb_array_length(p_rows) = 0 then
    raise exception 'لا توجد صفوف صالحة للاستيراد';
  end if;

  if jsonb_array_length(p_rows) > 500 then
    raise exception 'الحد الأقصى 500 صف في كل عملية استيراد';
  end if;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    begin
      v_building_name := nullif(trim(item ->> 'building_name'), '');
      v_customer_number := nullif(trim(item ->> 'customer_number'), '');
      v_customer_name := coalesce(
        nullif(trim(item ->> 'customer_name'), ''),
        v_building_name
      );
      v_month := coalesce(
        nullif(trim(item ->> 'month'), ''),
        to_char(current_date, 'YYYY-MM')
      );
      v_price := (nullif(trim(item ->> 'monthly_price'), ''))::numeric;
      v_elevator_count := greatest(
        coalesce((item ->> 'elevator_count')::integer, 1),
        1
      );
      v_line_name := nullif(trim(item ->> 'maintenance_line'), '');
      v_address := coalesce(
        nullif(trim(item ->> 'address'), ''),
        'غير محدد'
      );
      v_owner := coalesce(
        nullif(trim(item ->> 'owner'), ''),
        v_customer_name,
        v_building_name,
        'غير محدد'
      );
      v_customer_id := null;
      v_building_id := null;
      v_line_id := null;

      if v_building_name is null then
        raise exception 'اسم العمارة مطلوب';
      end if;

      if v_line_name is null then
        raise exception 'خط الصيانة مطلوب';
      end if;

      if v_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
        raise exception 'الشهر يجب أن يكون بالشكل YYYY-MM';
      end if;

      if v_price is null or v_price < 0 then
        raise exception 'سعر الشهر يجب أن يكون صفرًا أو أكبر';
      end if;

      if v_elevator_count > 50 then
        raise exception 'عدد المصاعد في الصف الواحد لا يمكن أن يزيد عن 50';
      end if;

      v_month_date := (v_month || '-01')::date;
      v_created_this_row := 0;

      select id
      into v_line_id
      from public.maintenance_lines
      where lower(trim(name)) = lower(v_line_name)
      limit 1;

      if v_line_id is null then
        insert into public.maintenance_lines(name)
        values (v_line_name)
        returning id into v_line_id;
      end if;

      -- Only create/link a customer when the optional number is present.
      if v_customer_number is not null then
        select id
        into v_customer_id
        from public.customers
        where trim(phone) = v_customer_number
        order by created_at
        limit 1;

        if v_customer_id is null then
          insert into public.customers(name, phone, address)
          values (v_customer_name, v_customer_number, v_address)
          returning id into v_customer_id;

          v_customers_created := v_customers_created + 1;
        else
          update public.customers
          set
            name = case
              when name = '' or name = 'غير محدد' then v_customer_name
              else name
            end,
            address = case
              when address = '' or address = 'غير محدد' then v_address
              else address
            end
          where id = v_customer_id;
        end if;
      end if;

      -- An import without a customer number matches by building name.
      -- A later import can add the missing customer number to that building.
      select id
      into v_building_id
      from public.buildings
      where lower(trim(name)) = lower(v_building_name)
        and (
          v_customer_number is null
          or trim(phone) = v_customer_number
          or trim(phone) = ''
        )
      order by
        case when maintenance_line_id = v_line_id then 0 else 1 end,
        case
          when v_customer_number is not null
            and trim(phone) = v_customer_number then 0
          else 1
        end,
        created_at
      limit 1;

      if v_building_id is null then
        insert into public.buildings(
          name,
          address,
          owner,
          phone,
          elevator_count,
          maintenance_line_id,
          customer_id,
          notes
        )
        values (
          v_building_name,
          v_address,
          v_owner,
          coalesce(v_customer_number, ''),
          v_elevator_count,
          v_line_id,
          v_customer_id,
          'تم الإنشاء من استيراد Excel'
        )
        returning id into v_building_id;

        v_buildings_created := v_buildings_created + 1;
      else
        update public.buildings
        set
          maintenance_line_id = v_line_id,
          customer_id = coalesce(v_customer_id, customer_id),
          phone = coalesce(v_customer_number, phone),
          address = case
            when v_address <> 'غير محدد' then v_address
            else address
          end,
          owner = case
            when v_owner <> 'غير محدد' then v_owner
            else owner
          end
        where id = v_building_id;

        v_buildings_updated := v_buildings_updated + 1;
      end if;

      select count(*), coalesce(max(elevator_number), 0)
      into v_existing_elevators, v_next_elevator_number
      from public.elevators
      where building_id = v_building_id;

      while v_existing_elevators < v_elevator_count
      loop
        v_next_elevator_number := v_next_elevator_number + 1;

        insert into public.elevators(
          elevator_number,
          elevator_name,
          building_id,
          maintenance_line_id,
          maintenance_subscription,
          maintenance_price,
          maintenance_start_date,
          status,
          notes
        )
        values (
          v_next_elevator_number,
          'مصعد ' || v_next_elevator_number,
          v_building_id,
          v_line_id,
          'شهري',
          0,
          v_month_date,
          'نشط',
          'تم الإنشاء من استيراد Excel'
        );

        v_existing_elevators := v_existing_elevators + 1;
        v_elevators_created := v_elevators_created + 1;
        v_created_this_row := v_created_this_row + 1;
      end loop;

      v_unit_price := round(
        v_price / greatest(v_existing_elevators, 1),
        4
      );

      update public.elevators
      set
        maintenance_subscription = 'شهري',
        maintenance_price = v_unit_price,
        maintenance_start_date = v_month_date,
        maintenance_line_id = v_line_id
      where building_id = v_building_id;

      get diagnostics v_updated_this_row = row_count;
      v_elevators_updated := v_elevators_updated
        + greatest(v_updated_this_row - v_created_this_row, 0);

      -- Put any rounding remainder on the first elevator.
      update public.elevators
      set maintenance_price = maintenance_price + (
        v_price - (
          select coalesce(sum(maintenance_price), 0)
          from public.elevators
          where building_id = v_building_id
        )
      )
      where id = (
        select id
        from public.elevators
        where building_id = v_building_id
        order by elevator_number, id
        limit 1
      );

      update public.buildings
      set elevator_count = (
        select count(*)
        from public.elevators
        where building_id = v_building_id
      )
      where id = v_building_id;

    exception when others then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object(
          'row', row_number,
          'building_name', coalesce(v_building_name, ''),
          'message', sqlerrm
        )
      );
    end;

    row_number := row_number + 1;
  end loop;

  return jsonb_build_object(
    'customers_created', v_customers_created,
    'buildings_created', v_buildings_created,
    'buildings_updated', v_buildings_updated,
    'elevators_created', v_elevators_created,
    'elevators_updated', v_elevators_updated,
    'errors', v_errors
  );
end;
$$;

revoke all
on function public.import_buildings_and_elevators(jsonb)
from public, anon;

grant execute
on function public.import_buildings_and_elevators(jsonb)
to authenticated;

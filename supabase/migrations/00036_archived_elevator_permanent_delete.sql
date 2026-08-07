-- حذف المبنى وكل بياناته من داخل قائمة المصاعد المؤرشفة.

create or replace function public.permanently_delete_building_from_archived_elevator(
  p_elevator_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_elevator public.elevators%rowtype;
begin
  if auth.uid() is null
     or not public.has_app_permission('elevators', 'delete')
     or not public.has_app_permission('buildings', 'delete') then
    raise exception 'غير مسموح بالحذف النهائي للمبنى ومصاعده';
  end if;

  select *
    into target_elevator
  from public.elevators
  where id = p_elevator_id
  for update;

  if target_elevator.id is null then
    raise exception 'المصعد غير موجود';
  end if;

  if target_elevator.archived_at is null then
    raise exception 'يجب أرشفة المصعد قبل الحذف النهائي';
  end if;

  -- الفواتير تستخدم قيد RESTRICT، لذلك تُحذف قبل المبنى.
  -- بنود الفواتير تُحذف تلقائيًا مع الفاتورة.
  delete from public.maintenance_invoices
  where building_id = target_elevator.building_id;

  -- حذف المبنى يحذف كل مصاعده وسجلات التشغيل والتاريخ والمالية
  -- المرتبطة به تلقائيًا من خلال قيود CASCADE الموجودة بالمشروع.
  delete from public.buildings
  where id = target_elevator.building_id;
end;
$$;

revoke all on function public.permanently_delete_building_from_archived_elevator(uuid) from public, anon;
grant execute on function public.permanently_delete_building_from_archived_elevator(uuid) to authenticated;

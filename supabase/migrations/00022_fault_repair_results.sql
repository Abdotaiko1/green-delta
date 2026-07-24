-- Mandatory fault cause and technician repair results for faults and fault tasks.

alter table public.faults
  add column if not exists fault_cause text,
  add column if not exists repair_status text not null default 'ما زال عاطل',
  add column if not exists repaired_at timestamptz;

alter table public.faults drop constraint if exists faults_repair_status_check;
alter table public.faults add constraint faults_repair_status_check
  check (repair_status in ('تم الإصلاح', 'ما زال عاطل'));

alter table public.technician_tasks
  add column if not exists fault_cause text,
  add column if not exists fault_result text,
  add column if not exists completed_at timestamptz;

alter table public.technician_tasks drop constraint if exists technician_tasks_fault_result_check;
alter table public.technician_tasks add constraint technician_tasks_fault_result_check
  check (fault_result is null or fault_result in ('تم الإصلاح', 'ما زال عاطل'));

create or replace function public.technician_set_fault_result(
  p_fault_id uuid,
  p_repair_status text,
  p_fault_cause text
)
returns void language plpgsql security definer set search_path = public
as $$
declare technician_record_id uuid;
begin
  technician_record_id := public.current_technician_id();
  if public.current_app_role() <> 'technician' or technician_record_id is null then
    raise exception 'حساب تسجيل الدخول غير مربوط بفني';
  end if;
  if p_repair_status not in ('تم الإصلاح', 'ما زال عاطل') then
    raise exception 'حالة الإصلاح غير صحيحة';
  end if;
  if length(trim(coalesce(p_fault_cause, ''))) = 0 then
    raise exception 'سبب العطل إجباري';
  end if;

  update public.faults
  set repair_status = p_repair_status,
      fault_cause = trim(p_fault_cause),
      status = case when p_repair_status = 'تم الإصلاح' then 'مغلق' else 'قيد المعالجة' end,
      repaired_at = case when p_repair_status = 'تم الإصلاح' then now() else null end
  where id = p_fault_id and technician_id = technician_record_id;

  if not found then raise exception 'هذا العطل غير مسند إلى الفني'; end if;
end;
$$;

create or replace function public.technician_set_fault_task_result(
  p_task_id uuid,
  p_repair_status text,
  p_fault_cause text
)
returns void language plpgsql security definer set search_path = public
as $$
declare technician_record_id uuid;
begin
  technician_record_id := public.current_technician_id();
  if public.current_app_role() <> 'technician' or technician_record_id is null then
    raise exception 'حساب تسجيل الدخول غير مربوط بفني';
  end if;
  if p_repair_status not in ('تم الإصلاح', 'ما زال عاطل') then
    raise exception 'حالة الإصلاح غير صحيحة';
  end if;
  if length(trim(coalesce(p_fault_cause, ''))) = 0 then
    raise exception 'سبب العطل إجباري';
  end if;

  update public.technician_tasks
  set fault_result = p_repair_status,
      fault_cause = trim(p_fault_cause),
      status = case when p_repair_status = 'تم الإصلاح' then 'تمت' else 'مكلف' end,
      completed_at = case when p_repair_status = 'تم الإصلاح' then now() else null end
  where id = p_task_id and technician_id = technician_record_id and task_type = 'عطل';

  if not found then raise exception 'مهمة العطل غير مسندة إلى الفني'; end if;
end;
$$;

revoke all on function public.technician_set_fault_result(uuid, text, text) from public, anon;
grant execute on function public.technician_set_fault_result(uuid, text, text) to authenticated;
revoke all on function public.technician_set_fault_task_result(uuid, text, text) from public, anon;
grant execute on function public.technician_set_fault_task_result(uuid, text, text) to authenticated;

drop policy if exists "role faults technician update" on public.faults;

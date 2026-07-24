-- Repair older technician rows that were created before login accounts were linked.

update public.technicians as technician
set user_id = app_user.id
from public.users as app_user
where technician.user_id is null
  and app_user.role = 'technician'
  and lower(trim(technician.name)) = lower(trim(app_user.full_name))
  and not exists (
    select 1 from public.technicians as linked
    where linked.user_id = app_user.id
  );

create or replace function public.current_technician_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select technician.id
      from public.technicians as technician
      where technician.user_id = auth.uid()
      limit 1
    ),
    (
      select technician.id
      from public.technicians as technician
      join public.users as app_user
        on lower(trim(app_user.full_name)) = lower(trim(technician.name))
      where app_user.id = auth.uid()
        and app_user.role = 'technician'
        and technician.user_id is null
      limit 1
    )
  );
$$;

-- Optional technical details for elevators.
-- Run once after the previous migrations.

alter table public.elevators
  add column if not exists machine_type text,
  add column if not exists chair_k_type text,
  add column if not exists chair_t_type text,
  add column if not exists counterweight_type text,
  add column if not exists interior_buttons_shape text;

alter table public.elevators
  drop constraint if exists elevators_interior_buttons_shape_check;

alter table public.elevators
  add constraint elevators_interior_buttons_shape_check
  check (interior_buttons_shape is null or interior_buttons_shape in ('مربعة', 'مدورة'));


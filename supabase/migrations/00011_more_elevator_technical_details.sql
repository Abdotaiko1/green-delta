-- Additional optional elevator technical details.
-- Run once after migration 00010.

alter table public.elevators
  add column if not exists lock_type text,
  add column if not exists tensioner_type text,
  add column if not exists pump_type text,
  add column if not exists controller_board_type text,
  add column if not exists has_emergency boolean,
  add column if not exists has_phase_correct boolean,
  add column if not exists has_inverter boolean;


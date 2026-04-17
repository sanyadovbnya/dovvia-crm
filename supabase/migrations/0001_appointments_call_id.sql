-- Adds call_id + source columns to appointments so Vapi-sourced bookings
-- can be upserted idempotently from the dashboard.
--
-- Run in Supabase SQL Editor (one-off).

alter table public.appointments
  add column if not exists call_id text,
  add column if not exists source text default 'manual';

-- Plain (non-partial) unique index so ON CONFLICT (call_id) works via PostgREST.
-- Postgres treats NULLs as distinct in unique indexes, so manual entries
-- with call_id = NULL still insert fine.
create unique index if not exists appointments_call_id_key
  on public.appointments (call_id);

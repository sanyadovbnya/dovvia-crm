-- Adds a separate column for the phone number the customer actually CALLED FROM
-- (Vapi's caller ID), alongside customer_phone which is the number they
-- spoke aloud (and may be a different callback number).
--
-- Run in Supabase SQL Editor (one-off).

alter table public.appointments
  add column if not exists caller_phone text;

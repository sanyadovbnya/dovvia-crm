-- Adds the user's Vapi assistant ID to their profile so the
-- availability edge function can resolve incoming Vapi tool calls
-- back to the right user's appointments.
--
-- Run in Supabase SQL Editor, then run the UPDATE at the bottom
-- with your own auth user id + assistant id.

alter table public.profiles
  add column if not exists vapi_assistant_id text;

create unique index if not exists profiles_vapi_assistant_id_key
  on public.profiles (vapi_assistant_id);

-- ONE-TIME SETUP:
-- Replace <YOUR_AUTH_USER_ID> with your Supabase auth user id
-- (Supabase dashboard → Authentication → Users → click your user → copy UID).
-- The Max assistant id is: 975a2861-4b48-4c0c-be9e-528b7b850ea9
--
-- update public.profiles
--   set vapi_assistant_id = '975a2861-4b48-4c0c-be9e-528b7b850ea9'
--   where id = '<YOUR_AUTH_USER_ID>';

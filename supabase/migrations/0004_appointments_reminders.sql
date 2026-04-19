-- Tracks which SMS reminders have been dispatched for each appointment so the
-- send-reminders cron never double-sends.
--
-- Run in Supabase SQL Editor (one-off).

alter table public.appointments
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists reminder_2h_sent_at  timestamptz;

-- Helps the cron scan only active scheduled appointments in the near future.
create index if not exists appointments_scheduled_date_idx
  on public.appointments (date, status)
  where status = 'scheduled';

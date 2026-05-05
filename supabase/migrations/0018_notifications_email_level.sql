-- Per-tenant email-notification preference. Controls which calls trigger
-- a Mailgun email after the vapi-webhook upserts them into public.calls.
--
-- Levels (most → least chatty):
--   all     — every completed call (default; max signal, accepts the noise)
--   real    — booked appointments OR callback requests OR calls > 60s
--             (cuts hang-ups, silence, and spam; keeps real conversations)
--   booked  — only confirmed appointments (signal-only)
--   off     — never send email notifications
--
-- The check constraint is enforced by the DB so a typo in the UI can't
-- silently break delivery — the update would fail loudly instead.

alter table profiles
  add column if not exists notifications_email_level text default 'all';

-- Drop-and-recreate the constraint so re-running this migration after
-- the legal values change doesn't choke. (Postgres has no
-- "alter table … add constraint if not exists".)
alter table profiles
  drop constraint if exists profiles_notifications_email_level_check;

alter table profiles
  add constraint profiles_notifications_email_level_check
    check (notifications_email_level in ('all', 'real', 'booked', 'off'));

-- Backfill any null rows so existing tenants get the default behavior.
update profiles
  set notifications_email_level = 'all'
  where notifications_email_level is null;

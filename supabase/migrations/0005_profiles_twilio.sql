-- Per-user Twilio credentials + shop name for SMS reminders.
-- Each Dovvia user supplies their own Twilio account; the send-reminders
-- function reads these per appointment owner.
--
-- RLS on profiles already restricts rows to the owning user, so these
-- columns are not readable by other tenants.

alter table public.profiles
  add column if not exists shop_name          text,
  add column if not exists twilio_account_sid text,
  add column if not exists twilio_auth_token  text,
  add column if not exists twilio_from_number text;

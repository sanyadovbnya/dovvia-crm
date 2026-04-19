# send-reminders

Cron-triggered SMS reminders via Twilio. Sends 24h and 2h before each scheduled appointment. Marks `reminder_24h_sent_at` / `reminder_2h_sent_at` on the appointment row so it never double-sends.

**Multi-tenant:** each Dovvia user brings their own Twilio account. Credentials are stored per-user in `profiles` and entered via the Settings modal in the app — no shared CLI secrets.

## Setup

### 1. Run the migrations

Paste in Supabase SQL Editor:

```sql
-- 0004_appointments_reminders.sql
alter table public.appointments
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists reminder_2h_sent_at  timestamptz;
create index if not exists appointments_scheduled_date_idx
  on public.appointments (date, status) where status = 'scheduled';

-- 0005_profiles_twilio.sql
alter table public.profiles
  add column if not exists shop_name          text,
  add column if not exists twilio_account_sid text,
  add column if not exists twilio_auth_token  text,
  add column if not exists twilio_from_number text;
```

### 2. Deploy the function (one-time)

```bash
cd .claude/worktrees/competent-torvalds-45fb0f
npx supabase functions deploy send-reminders --no-verify-jwt
```

### 3. Each user enters Twilio credentials in the app

Dovvia → top-right **Settings** icon → **SMS Reminders (Twilio)** section. Fill in:
- **Shop name** — appears in every text, e.g. "Mike's Repair"
- **Twilio Account SID** — from https://console.twilio.com/ (Account Info)
- **Twilio Auth Token** — from Account Info (click "Show")
- **Twilio Phone Number** — must be SMS-enabled, format `+15093214044`

Click **Save SMS Settings**. Reminders start firing from the next cron tick for that user.

Leaving any field blank **disables** reminders for that user (cron skips them silently).

### 4. Schedule the cron (one-time per project)

Paste in Supabase SQL Editor:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-reminders-every-15m',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://tuqonyutsrkbkqzzsmzq.supabase.co/functions/v1/send-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
```

To remove:

```sql
select cron.unschedule('send-reminders-every-15m');
```

### 5. Optional manual test

```bash
curl -X POST 'https://tuqonyutsrkbkqzzsmzq.supabase.co/functions/v1/send-reminders'
```

Response:

```json
{
  "ok": true,
  "scanned": 5,      // scheduled appointments in next 48h
  "eligible": 2,     // fell in 24h ± 30min or 2h ± 30min window
  "sent_24h": 1,
  "sent_2h": 1,
  "unconfigured": 0, // owner hasn't saved Twilio creds
  "failed": 0,
  "failures": []
}
```

## How it works

- Every 15 minutes, Supabase cron POSTs to `/functions/v1/send-reminders`.
- Function pulls scheduled appointments in the next 48h.
- For each, computes minutes-to-appointment. In 24h ± 30min (and 24h reminder not yet sent) → queue 24h SMS. In 2h ± 30min (and 2h reminder not yet sent) → queue 2h SMS.
- Fetches each owner's Twilio config from `profiles`. Skips owners without all three (SID, token, number).
- Sends via Twilio REST API, marks the appointment row atomically.

## Edge cases handled

- Cancelled or rescheduled appointments aren't touched (status = 'scheduled' only).
- Cron miss of one 15-min tick: ±30min window catches it on the next tick.
- Users without Twilio: counted as `unconfigured`, not failed.
- Missing phone on appointment: counted as failed with reason.

## Message templates

```
24h: Hey {first_name}, {shop_name}: reminder your {service_type} is on {weekday, month day} at {time}. Call us to cancel or reschedule.
2h:  {first_name}, {shop_name}: your technician will arrive in about 2 hours — {time} today for {service_type}. See you soon!
```

Edit `messageFor()` in `index.ts` to customize.

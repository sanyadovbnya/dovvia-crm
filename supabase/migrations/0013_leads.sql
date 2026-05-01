-- Web leads (e.g. Forminator form submissions) tracked alongside Vapi calls.
-- Each tenant exposes a stable webhook URL with a per-user shared secret;
-- the intake-lead edge function reads that header to look up the owner.
--
-- Outcomes mirror call_resolutions:
--   waiting (default), booked, done, didnt_work_out
--
-- For "booked": booked_for is free-form text. If date/time is concrete,
-- the CRM also writes an appointments row and stores its id in appointment_id
-- so Max's availability check sees the slot taken on the next inbound call.

create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,

  name            text,
  email           text,
  phone           text,
  details         text,
  source          text default 'web',

  status          text not null default 'waiting'
                    check (status in ('waiting', 'booked', 'done', 'didnt_work_out')),

  -- Booked-outcome fields
  booked_for      text,
  appointment_id  uuid references public.appointments(id) on delete set null,

  -- Done-outcome fields
  amount_cents    integer,
  work_description text,

  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists leads_user_created_idx on public.leads (user_id, created_at desc);
create index if not exists leads_user_status_idx on public.leads (user_id, status);

alter table public.leads enable row level security;
drop policy if exists leads_owner_all on public.leads;
create policy leads_owner_all on public.leads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Per-user shared secret used by the intake-lead edge function to resolve the
-- tenant from a webhook header. Backfilled with random hex for existing rows.
-- Uses gen_random_uuid() (built-in since Postgres 13) instead of
-- pgcrypto's gen_random_bytes so this migration runs on any project
-- regardless of whether the pgcrypto extension is in the search_path.
alter table public.profiles
  add column if not exists lead_intake_secret text
    default replace(gen_random_uuid()::text, '-', '');

update public.profiles
  set lead_intake_secret = replace(gen_random_uuid()::text, '-', '')
  where lead_intake_secret is null;

alter table public.profiles
  alter column lead_intake_secret set not null;

create unique index if not exists profiles_lead_intake_secret_key
  on public.profiles (lead_intake_secret);

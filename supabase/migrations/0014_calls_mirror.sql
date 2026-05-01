-- Mirror of Vapi calls into our own database. Until now the dashboard
-- fetched directly from Vapi on every load, which meant every browser
-- carried the API key, every refresh hit Vapi, and history evaporated
-- if Vapi ever expired or pruned old calls.
--
-- The new architecture:
--   - Vapi server-webhook posts call.ended events to our `vapi-webhook`
--     edge function, which validates a per-tenant secret and upserts
--     into this table.
--   - A `vapi-sync` edge function backfills history on demand using the
--     tenant's stored vapi_key (server-side only, never in the browser).
--   - The browser reads from this table via RLS-protected queries and
--     subscribes to realtime inserts/updates so new calls appear within
--     a second of the call ending.

-- ─── Per-tenant webhook secret ─────────────────────────────────────────
-- Mirrors lead_intake_secret: random 32-char hex, generated automatically
-- for new profiles, rotatable from Settings. Uses gen_random_uuid() (built
-- in to Postgres 13+) instead of pgcrypto's gen_random_bytes so the
-- migration is portable across Supabase projects regardless of extension
-- search_path quirks.
alter table public.profiles
  add column if not exists vapi_webhook_secret text
    default replace(gen_random_uuid()::text, '-', '');

-- Backfill any existing profiles that pre-date this column.
update public.profiles
   set vapi_webhook_secret = replace(gen_random_uuid()::text, '-', '')
 where vapi_webhook_secret is null;

alter table public.profiles
  alter column vapi_webhook_secret set not null;

-- Lookup-by-secret index. The webhook function does
--   SELECT id FROM profiles WHERE vapi_webhook_secret = $1
-- on every call; without this index it's a sequential scan.
create unique index if not exists profiles_vapi_webhook_secret_idx
  on public.profiles (vapi_webhook_secret);

-- ─── Calls mirror ──────────────────────────────────────────────────────
create table if not exists public.calls (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  vapi_id       text not null,

  -- Timing — startedAt is what the dashboard sorts on; createdAt is the
  -- record-creation timestamp Vapi gives us (slightly before startedAt).
  vapi_created_at timestamptz,
  started_at      timestamptz,
  ended_at        timestamptz,

  -- Identity
  customer_phone   text,
  customer_name    text,
  customer_address text,

  -- Outcomes (extracted from analysis.structuredData / structured outputs)
  end_reason         text,
  service_type       text,
  problem            text,
  appointment_booked boolean,
  appointment_date   text,   -- string because Vapi returns free-form
  appointment_time   text,
  wants_callback     boolean,

  -- Content
  summary       text,
  transcript    jsonb,      -- array of {role, text} or raw string from Vapi
  recording_url text,
  analysis      jsonb,      -- whole analysis blob for richer queries later

  -- Forensic fallback — full Vapi payload so we can re-extract any field
  -- if our column mapping ever misses something. Strip large transcripts
  -- if the row gets too big; for now we keep the whole thing.
  vapi_raw jsonb not null,

  -- Bookkeeping
  inserted_at timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- The natural unique key. Idempotent upserts on retry.
  unique (user_id, vapi_id)
);

-- The dashboard pulls "newest N for this user". A composite index on
-- (user_id, started_at desc) makes that an index scan even with millions
-- of rows across hundreds of tenants.
create index if not exists calls_user_started_idx
  on public.calls (user_id, started_at desc nulls last);

-- For quick "find a call by its Vapi id" lookups (resolution joins, etc).
create index if not exists calls_user_vapi_id_idx
  on public.calls (user_id, vapi_id);

-- updated_at maintained by trigger so it changes on every webhook upsert.
create or replace function public.set_calls_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists calls_set_updated_at on public.calls;
create trigger calls_set_updated_at
  before update on public.calls
  for each row execute function public.set_calls_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────────────
alter table public.calls enable row level security;

-- Tenants can read their own calls. They cannot write — all inserts and
-- updates flow through service-role edge functions (webhook + sync) so
-- a compromised browser session can't poison another tenant's data or
-- forge call history.
drop policy if exists calls_owner_select on public.calls;
create policy calls_owner_select on public.calls
  for select using (auth.uid() = user_id);

-- Allow tenants to delete their own calls (e.g. clear-history button).
-- Optional — comment out if you want deletes to also flow through an
-- edge function.
drop policy if exists calls_owner_delete on public.calls;
create policy calls_owner_delete on public.calls
  for delete using (auth.uid() = user_id);

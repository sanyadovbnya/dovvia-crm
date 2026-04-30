-- Per-call outcome tracking. Vapi calls aren't persisted in our DB, so we
-- key by the Vapi call_id (text) and let the operator record what actually
-- happened after the conversation ended: it didn't pan out, an appointment
-- got booked, or the job is done with money/work captured.

create table if not exists public.call_resolutions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  call_id         text not null,

  -- 'didnt_work_out' | 'booked' | 'done'
  outcome         text not null check (outcome in ('didnt_work_out', 'booked', 'done')),

  -- For 'booked': free-form "when" (e.g. "Fri 4/25 at 2pm")
  booked_for      text,

  -- For 'done': money + description of work performed
  amount_cents    integer,
  work_description text,

  notes           text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (user_id, call_id)
);

create index if not exists call_resolutions_user_idx on public.call_resolutions (user_id, updated_at desc);

alter table public.call_resolutions enable row level security;
drop policy if exists call_resolutions_owner_all on public.call_resolutions;
create policy call_resolutions_owner_all on public.call_resolutions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

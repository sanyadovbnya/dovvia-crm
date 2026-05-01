-- "Reached out" timestamp on leads. Distinct from status because it's
-- orthogonal: a lead can be reached-but-still-waiting (Mike called, left
-- a voicemail) or reached-and-booked (Mike called, scheduled the appt).
-- Keeping it as a timestamp instead of a boolean lets the UI surface
-- "reached 2h ago" relative copy and supports an undo by setting null.

alter table public.leads
  add column if not exists reached_out_at timestamptz;

-- Index so the "Reached" filter chip stays cheap as the leads list grows.
create index if not exists leads_user_reached_idx
  on public.leads (user_id, reached_out_at desc nulls last);

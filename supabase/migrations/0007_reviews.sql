-- Customer reviews captured via a token-gated public page.
-- The send-review-requests cron creates a row with rating=null when it sends
-- the SMS; the customer fills in rating + feedback by visiting /r/<token>.
--
-- google_review_url on profiles: where 4-5 star reviewers get redirected after
-- submitting (so they leave a public Google review). Leave blank to keep all
-- ratings in-house.

create table if not exists public.reviews (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  appointment_id  uuid references public.appointments(id) on delete set null,

  customer_name   text,
  customer_phone  text,
  customer_email  text,

  rating          smallint check (rating between 1 and 5),
  feedback        text,
  redirected_to_google boolean default false,

  token           text not null unique default encode(gen_random_bytes(12), 'hex'),

  request_sent_at timestamptz,
  submitted_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists reviews_user_created_idx on public.reviews (user_id, created_at desc);
create index if not exists reviews_token_idx on public.reviews (token);
create index if not exists reviews_appointment_idx on public.reviews (appointment_id);

-- Owner can read/write their own; the public review page hits the row
-- via the edge function with service-role, so RLS only needs to cover
-- authenticated CRM access here.
alter table public.reviews enable row level security;
drop policy if exists reviews_owner_all on public.reviews;
create policy reviews_owner_all on public.reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.profiles
  add column if not exists google_review_url text;

-- Adds Stripe billing columns to profiles. Each tenant has at most one
-- Stripe Customer; subscription_status drives the paywall gate in the
-- frontend. The stripe-webhook edge function keeps these in sync with
-- Stripe — Stripe is the source of truth, this table is just a mirror
-- so the dashboard doesn't have to hit Stripe on every page load.
--
-- Possible subscription_status values (from Stripe):
--   inactive    — never subscribed (default)
--   incomplete  — checkout abandoned mid-flow
--   trialing    — in a free trial (we don't currently offer trials)
--   active      — paid and current
--   past_due    — payment failed, Stripe is retrying; keep them in
--   canceled    — subscription ended; bounce to paywall
--   unpaid      — exhausted retries; bounce to paywall

alter table profiles
  add column if not exists stripe_customer_id text,
  add column if not exists subscription_status text default 'inactive',
  add column if not exists subscription_plan text,
  add column if not exists current_period_end timestamptz;

-- Webhook resolves the tenant by stripe_customer_id (Stripe doesn't
-- know our user ids), so we want this lookup to be O(log n).
create index if not exists profiles_stripe_customer_id_idx
  on profiles (stripe_customer_id);

-- The existing "select own profile" RLS policy already covers the new
-- columns. We deliberately do NOT add an UPDATE policy for these —
-- only the service-role client (used by stripe-webhook + stripe-checkout)
-- should ever write them. Tenants can read their own subscription state
-- to render the paywall, but they can't fake "I'm subscribed".

-- Grandfather every account that already exists when this migration
-- runs. Anyone here predates billing — that's the founder's own account
-- (getdovvia@gmail.com), Mike (already paying via the old flow), and
-- any test accounts. We don't want any of them locked out the moment
-- the paywall ships. New signups (after this migration) get 'inactive'
-- from the column default and must subscribe through Stripe Checkout.
--
-- Idempotent guard: `stripe_customer_id IS NULL` means "never reached
-- Stripe Checkout", so re-running this migration won't reactivate
-- somebody who later cancelled their paid subscription. We also leave
-- subscription_plan as NULL so the Billing tab in Settings honestly
-- shows "No active plan" for grandfathered accounts (they don't have
-- a Stripe plan — they just have access).
update profiles
  set subscription_status = 'active'
  where subscription_status = 'inactive'
    and stripe_customer_id is null;

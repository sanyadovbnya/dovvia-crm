-- Geocoding for the Map page. Each appointment row that has an address
-- gets a lat/lng pair the first time we see it; subsequent dashboard
-- loads use the cached coords without re-hitting any geocoder.
--
-- We store on appointments rather than on a separate customers table
-- because that's where the canonical address lives in this codebase
-- (groupIntoCustomers derives "the customer's address" from their most
-- recent appointment).

alter table public.appointments
  add column if not exists lat            double precision,
  add column if not exists lng            double precision,
  add column if not exists geocoded_at    timestamptz,
  add column if not exists geocode_status text;
  -- geocode_status values:
  --   'ok'       — lat/lng populated successfully
  --   'no_match' — geocoder returned nothing for this address
  --   'error'    — geocoder hit an error (will retry on next backfill)
  --   null       — never attempted

-- Map page query: "give me every customer's most recent geocoded
-- appointment per user." A composite index on (user_id, lat) lets us
-- skip the rows that aren't on the map at all without a sequential scan.
create index if not exists appointments_user_geo_idx
  on public.appointments (user_id, lat)
  where lat is not null;

-- For the backfill function: "find me all addresses that haven't been
-- geocoded yet for this user." Filter index on (user_id) where status
-- is null gives us a tight working set even at 100k appointments.
create index if not exists appointments_user_pending_geocode_idx
  on public.appointments (user_id, created_at)
  where customer_address is not null and lat is null and geocode_status is null;

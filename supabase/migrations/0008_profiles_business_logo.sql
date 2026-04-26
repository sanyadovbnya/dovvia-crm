-- Optional logo URL displayed at the top of printed/emailed invoices.
alter table public.profiles
  add column if not exists business_logo_url text;

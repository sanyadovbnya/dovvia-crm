-- Invoices: per-tenant rows with line items, totals, status.
-- Number is a sequence per user starting from invoice_starting_number on profiles.

create table if not exists public.invoices (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  appointment_id   uuid references public.appointments(id) on delete set null,
  invoice_number    integer not null,

  customer_name     text not null,
  customer_email    text,
  customer_phone    text,
  customer_address  text,

  serviced_unit     text,
  service_date      date not null,

  -- Array of { description: string, amount: number }
  line_items        jsonb not null default '[]'::jsonb,

  subtotal          numeric(10,2) not null default 0,
  tax_rate          numeric(5,2)  not null default 0,
  tax_amount        numeric(10,2) not null default 0,
  total             numeric(10,2) not null default 0,

  notes             text,
  status            text not null default 'draft', -- draft | sent | paid

  sent_at           timestamptz,
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (user_id, invoice_number)
);

create index if not exists invoices_user_created_idx on public.invoices (user_id, created_at desc);

alter table public.invoices enable row level security;

drop policy if exists invoices_owner_all on public.invoices;
create policy invoices_owner_all on public.invoices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Profile columns for invoice settings.
alter table public.profiles
  add column if not exists business_address       text,
  add column if not exists business_email         text,
  add column if not exists business_website       text,
  add column if not exists invoice_default_tax_rate numeric(5,2),
  add column if not exists invoice_next_number    integer default 1001,
  add column if not exists invoice_footer         text default 'Thank you for your business!';

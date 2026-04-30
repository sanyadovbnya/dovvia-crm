alter table public.profiles
  add column if not exists invoice_email_subject text,
  add column if not exists invoice_email_body text;

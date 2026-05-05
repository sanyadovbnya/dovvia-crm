-- Per-tenant override of where call-notification emails are delivered.
-- NULL or empty array → fall back to auth.users.email (the founder's
-- inbox by default). Set to one-or-more addresses to send there
-- instead — useful when the owner wants notifications on a personal
-- inbox separate from their account-login email, or wants both
-- a manager and the owner to see every call.

alter table profiles
  add column if not exists notifications_email_to text[];

-- No check constraint on email format — we validate in the UI before
-- save (cheaper than reaching for a Postgres regex extension), and the
-- webhook tolerates malformed entries by letting Mailgun reject them.

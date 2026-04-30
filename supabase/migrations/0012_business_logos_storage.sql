-- Storage bucket for business logos shown on invoices.
-- Public-read because the logo is rendered into invoice PDFs that customers
-- view via signed URLs and the logo URL itself goes into the rendered HTML.
-- Writes are still scoped to the authenticated owner via RLS on the path.
--
-- Path layout:  <user_id>/logo
-- (single file per user; re-upload overwrites in place via upsert)

insert into storage.buckets (id, name, public)
values ('business-logos', 'business-logos', true)
on conflict (id) do update set public = true;

drop policy if exists business_logos_owner_insert on storage.objects;
create policy business_logos_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists business_logos_owner_update on storage.objects;
create policy business_logos_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'business-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'business-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists business_logos_owner_delete on storage.objects;
create policy business_logos_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'business-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public bucket already grants SELECT to anon, so no read policy needed.

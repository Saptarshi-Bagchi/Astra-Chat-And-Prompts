drop policy "Owner claims settings" on public.app_settings;
create policy "Owner claims settings"
  on public.app_settings for update to authenticated
  using (owner_email is null or owner_email = coalesce(auth.jwt() ->> 'email', ''))
  with check (owner_email is null or owner_email = coalesce(auth.jwt() ->> 'email', ''));

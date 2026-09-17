-- Harden email records: only the server role may append delivery history.
-- Studio owners may read logs and edit their own templates; portal users cannot.
revoke insert, update, delete on public.email_delivery_logs from authenticated;

 drop policy if exists "owner inserts email logs" on public.email_delivery_logs;
 drop policy if exists "owner reads email logs" on public.email_delivery_logs;
 create policy "studio owner reads email logs" on public.email_delivery_logs
 for select using (owner_id = auth.uid() and public.is_studio_owner());

 drop policy if exists "owner manages email templates" on public.email_templates;
 create policy "studio owner manages email templates" on public.email_templates
 for all using (owner_id = auth.uid() and public.is_studio_owner())
 with check (owner_id = auth.uid() and public.is_studio_owner());

 grant select, insert, update, delete on public.email_templates to authenticated;
 grant select on public.email_delivery_logs to authenticated;

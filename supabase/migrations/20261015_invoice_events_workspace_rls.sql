-- Make invoice event history readable through workspace roles.

begin;

drop policy if exists "owner reads invoice events" on public.invoice_events;
drop policy if exists "owner creates invoice events" on public.invoice_events;

create policy "workspace accountants read invoice events"
on public.invoice_events
for select
to authenticated
using (public.is_workspace_member(workspace_id, 'accountant'));

-- Normal clients do not write invoice events directly. All financial mutations
-- use controlled SECURITY DEFINER functions which also write the audit event.

commit;

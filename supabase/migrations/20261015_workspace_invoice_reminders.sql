-- Make automatic invoice reminders workspace-specific.

begin;

alter table public.workspace_settings
  add column if not exists invoice_reminders_enabled boolean not null default false,
  add column if not exists invoice_reminder_days integer not null default 7
    check (invoice_reminder_days between 1 and 30);

-- Preserve previous reminder behavior for existing real workspaces while
-- keeping isolated Hive development workspaces unable to trigger mail.
update public.workspace_settings settings
set invoice_reminders_enabled = true,
    invoice_reminder_days = coalesce(legacy.invoice_reminder_days, 7)
from public.workspaces workspace
left join public.company_settings legacy on legacy.owner_id = workspace.owner_id
where settings.workspace_id = workspace.id
  and workspace.slug not like 'hive-dev-%';

alter table public.invoice_reminder_sends
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

update public.invoice_reminder_sends reminder
set workspace_id = invoice.workspace_id
from public.invoices invoice
where invoice.id = reminder.invoice_id
  and reminder.workspace_id is null;

alter table public.invoice_reminder_sends
  alter column workspace_id set not null;

create index if not exists invoice_reminder_sends_workspace_idx
  on public.invoice_reminder_sends(workspace_id, scheduled_for, state);

alter table public.invoice_reminder_sends enable row level security;

drop policy if exists "workspace accountants read invoice reminders" on public.invoice_reminder_sends;
create policy "workspace accountants read invoice reminders"
on public.invoice_reminder_sends
for select
to authenticated
using (public.is_workspace_member(workspace_id, 'accountant'));

drop function if exists public.claim_invoice_reminders(date);

create function public.claim_invoice_reminders(p_run_date date default current_date)
returns table(
  reminder_id uuid,
  invoice_id uuid,
  workspace_id uuid,
  owner_id uuid,
  invoice_number text,
  total_rappen bigint,
  due_date date,
  recipient_email text,
  recipient_first_name text,
  company_name text,
  sender_email text,
  idempotency_key text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice record;
  v_reminder_id uuid;
  v_key text;
  v_existing_state text;
begin
  for v_invoice in
    select
      invoice.id,
      invoice.workspace_id,
      invoice.owner_id,
      invoice.invoice_number,
      invoice.total_rappen,
      invoice.due_date,
      coalesce(nullif(trim(invoice.customer_snapshot->>'email'), ''), customer.email) as recipient_email,
      coalesce(nullif(trim(invoice.customer_snapshot->>'contact_name'), ''), customer.contact_name, customer.company) as recipient_name,
      settings.business_name as company_name,
      settings.email as sender_email,
      settings.invoice_reminder_days as reminder_days
    from public.invoices invoice
    join public.customers customer
      on customer.id = invoice.customer_id
     and customer.workspace_id = invoice.workspace_id
    join public.workspace_settings settings
      on settings.workspace_id = invoice.workspace_id
    where invoice.status = 'sent'
      and settings.invoice_reminders_enabled
      and invoice.due_date - settings.invoice_reminder_days = p_run_date
      and invoice.is_legacy = false
    for update of invoice skip locked
  loop
    v_key := 'invoice-reminder:' || v_invoice.workspace_id::text || ':' ||
      v_invoice.id::text || ':' || v_invoice.reminder_days::text;

    insert into public.invoice_reminder_sends (
      workspace_id, owner_id, invoice_id, reminder_days,
      scheduled_for, idempotency_key, recipient
    )
    values (
      v_invoice.workspace_id,
      v_invoice.owner_id,
      v_invoice.id,
      v_invoice.reminder_days,
      p_run_date,
      v_key,
      lower(trim(v_invoice.recipient_email))
    )
    on conflict on constraint invoice_reminder_sends_invoice_id_reminder_days_key
    do update
      set workspace_id = excluded.workspace_id,
          state = case when public.invoice_reminder_sends.state = 'sent' then 'sent' else 'pending' end,
          attempts = case when public.invoice_reminder_sends.state = 'sent'
            then public.invoice_reminder_sends.attempts
            else public.invoice_reminder_sends.attempts + 1 end,
          updated_at = now(),
          recipient = excluded.recipient
    returning id, state into v_reminder_id, v_existing_state;

    if v_existing_state <> 'sent' then
      return query select
        v_reminder_id,
        v_invoice.id,
        v_invoice.workspace_id,
        v_invoice.owner_id,
        v_invoice.invoice_number,
        v_invoice.total_rappen,
        v_invoice.due_date,
        lower(trim(v_invoice.recipient_email)),
        split_part(trim(v_invoice.recipient_name), ' ', 1),
        v_invoice.company_name,
        v_invoice.sender_email,
        v_key;
    end if;
  end loop;
end;
$$;

revoke all on function public.claim_invoice_reminders(date) from public, anon, authenticated;

create or replace function public.complete_invoice_reminder(
  p_reminder_id uuid,
  p_success boolean,
  p_provider_id text default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reminder public.invoice_reminder_sends%rowtype;
begin
  select * into v_reminder
  from public.invoice_reminder_sends
  where id = p_reminder_id
  for update;

  if v_reminder.id is null then raise exception 'invoice reminder not found'; end if;

  if p_success then
    update public.invoice_reminder_sends
    set state = 'sent',
        provider_id = nullif(trim(p_provider_id), ''),
        sent_at = now(),
        last_error = null
    where id = v_reminder.id;

    insert into public.invoice_events(
      workspace_id, owner_id, invoice_id, kind, recipient, details
    )
    values (
      v_reminder.workspace_id,
      v_reminder.owner_id,
      v_reminder.invoice_id,
      'reminder_sent',
      v_reminder.recipient,
      jsonb_build_object(
        'reminder_days', v_reminder.reminder_days,
        'provider_id', nullif(trim(p_provider_id), '')
      )
    );
  else
    update public.invoice_reminder_sends
    set state = 'failed',
        last_error = left(coalesce(p_error, 'provider error'), 500)
    where id = v_reminder.id;
  end if;
end;
$$;

revoke all on function public.complete_invoice_reminder(uuid, boolean, text, text) from public, anon, authenticated;

commit;

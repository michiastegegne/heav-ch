-- Scheduled invoice reminders. The browser never sends these mails.
alter table public.company_settings
  add column if not exists invoice_reminder_days integer not null default 7;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'company_settings_invoice_reminder_days_check'
      and conrelid = 'public.company_settings'::regclass
  ) then
    alter table public.company_settings
      add constraint company_settings_invoice_reminder_days_check check (invoice_reminder_days in (3, 7, 10));
  end if;
end;
$$;

alter table public.invoice_events drop constraint if exists invoice_events_kind_check;
alter table public.invoice_events add constraint invoice_events_kind_check
  check (kind in ('created', 'updated', 'downloaded', 'sent', 'resent', 'paid', 'cancelled', 'send_failed', 'reminder_sent'));

create table public.invoice_reminder_sends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  reminder_days integer not null check (reminder_days in (3, 7, 10)),
  scheduled_for date not null,
  state text not null default 'pending' check (state in ('pending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  idempotency_key text not null unique,
  provider_id text,
  recipient text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, reminder_days)
);
create index invoice_reminder_sends_due_idx on public.invoice_reminder_sends(scheduled_for, state);
create trigger invoice_reminder_sends_updated before update on public.invoice_reminder_sends
  for each row execute function public.set_updated_at();

alter table public.invoice_reminder_sends enable row level security;
create policy "owner reads invoice reminders" on public.invoice_reminder_sends
  for select using (owner_id = auth.uid());
revoke all on public.invoice_reminder_sends from anon, authenticated;
grant select on public.invoice_reminder_sends to authenticated;

create or replace function public.claim_invoice_reminders(p_run_date date default current_date)
returns table (
  reminder_id uuid,
  invoice_id uuid,
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
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_invoice record;
  v_reminder_id uuid;
  v_key text;
  v_existing_state text;
begin
  for v_invoice in
    select invoice.id, invoice.owner_id, invoice.invoice_number, invoice.total_rappen, invoice.due_date,
      coalesce(nullif(trim(invoice.customer_snapshot->>'email'), ''), customer.email) as recipient_email,
      coalesce(nullif(trim(invoice.customer_snapshot->>'contact_name'), ''), customer.contact_name, customer.company) as recipient_name,
      settings.company_name, settings.email as sender_email,
      coalesce(settings.invoice_reminder_days, 7) as reminder_days
    from public.invoices invoice
    join public.customers customer on customer.id = invoice.customer_id
    join public.company_settings settings on settings.owner_id = invoice.owner_id
    where invoice.status = 'sent'
      and invoice.due_date - coalesce(settings.invoice_reminder_days, 7) = p_run_date
      and invoice.is_legacy = false
    for update of invoice skip locked
  loop
    v_key := 'invoice-reminder:' || v_invoice.id::text || ':' || v_invoice.reminder_days::text;
    insert into public.invoice_reminder_sends (owner_id, invoice_id, reminder_days, scheduled_for, idempotency_key, recipient)
    values (v_invoice.owner_id, v_invoice.id, v_invoice.reminder_days, p_run_date, v_key, lower(trim(v_invoice.recipient_email)))
    on conflict on constraint invoice_reminder_sends_invoice_id_reminder_days_key do update
      set state = case when public.invoice_reminder_sends.state = 'sent' then 'sent' else 'pending' end,
          attempts = case when public.invoice_reminder_sends.state = 'sent' then public.invoice_reminder_sends.attempts else public.invoice_reminder_sends.attempts + 1 end,
          updated_at = now(),
          recipient = lower(trim(v_invoice.recipient_email))
    returning id, state into v_reminder_id, v_existing_state;
    if v_existing_state <> 'sent' then
      return query select v_reminder_id, v_invoice.id, v_invoice.owner_id, v_invoice.invoice_number,
        v_invoice.total_rappen, v_invoice.due_date, lower(trim(v_invoice.recipient_email)),
        split_part(trim(v_invoice.recipient_name), ' ', 1), v_invoice.company_name,
        v_invoice.sender_email, v_key;
    end if;
  end loop;
end;
$$;
revoke all on function public.claim_invoice_reminders(date) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_invoice_reminders(date) to service_role;
  end if;
end $$;

create or replace function public.complete_invoice_reminder(
  p_reminder_id uuid,
  p_success boolean,
  p_provider_id text default null,
  p_error text default null
) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_reminder public.invoice_reminder_sends%rowtype;
begin
  select * into v_reminder from public.invoice_reminder_sends where id = p_reminder_id for update;
  if v_reminder.id is null then raise exception 'invoice reminder not found'; end if;
  if p_success then
    update public.invoice_reminder_sends set state = 'sent', provider_id = nullif(trim(p_provider_id), ''), sent_at = now(), last_error = null where id = v_reminder.id;
    insert into public.invoice_events(owner_id, invoice_id, kind, recipient, details)
      values (v_reminder.owner_id, v_reminder.invoice_id, 'reminder_sent', v_reminder.recipient, jsonb_build_object('reminder_days', v_reminder.reminder_days, 'provider_id', nullif(trim(p_provider_id), '')));
  else
    update public.invoice_reminder_sends set state = 'failed', last_error = left(coalesce(p_error, 'provider error'), 500) where id = v_reminder.id;
  end if;
end;
$$;
revoke all on function public.complete_invoice_reminder(uuid, boolean, text, text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.complete_invoice_reminder(uuid, boolean, text, text) to service_role;
  end if;
end $$;

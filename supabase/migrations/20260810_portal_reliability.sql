-- HEAV Studio reliability: server-owned numbering, Swiss creditor references,
-- safe deletion actions and invoice cancellation.

create table public.invoice_number_counters (
  owner_id uuid not null references auth.users(id) on delete cascade,
  invoice_year integer not null check (invoice_year between 2000 and 9999),
  last_value bigint not null check (last_value >= 0),
  primary key (owner_id, invoice_year)
);

alter table public.invoice_number_counters enable row level security;
revoke all on public.invoice_number_counters from public, anon, authenticated;

insert into public.invoice_number_counters (owner_id, invoice_year, last_value)
select
  owner_id,
  substring(invoice_number from '^HEAV-([0-9]{4})-')::integer,
  max(substring(invoice_number from '^HEAV-[0-9]{4}-([0-9]+)$')::bigint)
from public.invoices
where invoice_number ~ '^HEAV-[0-9]{4}-[0-9]+$'
group by owner_id, substring(invoice_number from '^HEAV-([0-9]{4})-')::integer
on conflict (owner_id, invoice_year) do update
set last_value = greatest(public.invoice_number_counters.last_value, excluded.last_value);

create or replace function public.make_creditor_reference(p_body text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_body text := upper(regexp_replace(p_body, '[^A-Za-z0-9]', '', 'g'));
  v_input text;
  v_expanded text := '';
  v_character text;
  v_remainder integer := 0;
  v_index integer;
begin
  if length(v_body) < 1 or length(v_body) > 21 then
    raise exception 'creditor reference body must contain 1 to 21 alphanumeric characters';
  end if;
  v_input := v_body || 'RF00';
  for v_index in 1..length(v_input) loop
    v_character := substring(v_input from v_index for 1);
    if v_character between '0' and '9' then
      v_expanded := v_expanded || v_character;
    else
      v_expanded := v_expanded || (ascii(v_character) - 55)::text;
    end if;
  end loop;
  for v_index in 1..length(v_expanded) loop
    v_remainder := (v_remainder * 10 + substring(v_expanded from v_index for 1)::integer) % 97;
  end loop;
  return 'RF' || lpad((98 - v_remainder)::text, 2, '0') || v_body;
end;
$$;
revoke all on function public.make_creditor_reference(text) from public, anon, authenticated;

alter table public.invoices add column payment_reference text;
alter table public.invoices add column customer_snapshot jsonb;
alter table public.invoices add column issuer_snapshot jsonb;
alter table public.invoices add column is_legacy boolean not null default false;
alter table public.company_settings add column website_url text not null default 'https://heav.ch';
alter table public.company_settings add column instagram_url text not null default '';
update public.company_settings
set default_tax_rate = 0
where length(trim(coalesce(vat_number, ''))) = 0;
update public.invoices
set is_legacy = true;
create unique index invoices_owner_payment_reference_idx
  on public.invoices(owner_id, payment_reference)
  where payment_reference is not null;

drop function public.create_invoice(uuid, uuid, text, date, date, numeric, text, jsonb);

create function public.create_invoice(
  p_customer_id uuid,
  p_project_id uuid,
  p_issue_date date,
  p_due_date date,
  p_tax_rate numeric,
  p_notes text,
  p_items jsonb
) returns table(invoice_id uuid, invoice_number text, payment_reference text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_invoice_id uuid;
  v_invoice_year integer;
  v_sequence bigint;
  v_invoice_number text;
  v_payment_reference text;
  v_customer_snapshot jsonb;
  v_issuer_snapshot jsonb;
  v_subtotal bigint;
  v_tax bigint;
  v_item_count integer;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if p_issue_date is null or p_due_date is null then raise exception 'invoice dates are required'; end if;
  if not exists (select 1 from public.customers where id = p_customer_id and owner_id = v_owner) then
    raise exception 'customer not found';
  end if;
  select to_jsonb(customer) into v_customer_snapshot
  from public.customers customer where customer.id = p_customer_id and customer.owner_id = v_owner;
  select to_jsonb(settings) into v_issuer_snapshot
  from public.company_settings settings where settings.owner_id = v_owner;
  if v_issuer_snapshot is null then raise exception 'company settings are required'; end if;
  if p_project_id is not null then
    perform 1 from public.projects
      where id = p_project_id and owner_id = v_owner and customer_id = p_customer_id
      for key share;
    if not found then raise exception 'project not found or customer mismatch'; end if;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'items must be an array'; end if;
  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 10 then raise exception 'one to ten items required'; end if;
  if p_due_date < p_issue_date then raise exception 'due date must not precede issue date'; end if;
  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 then raise exception 'invalid tax rate'; end if;
  if p_tax_rate > 0 and upper(trim(coalesce(v_issuer_snapshot->>'vat_number', ''))) !~ '^CHE-[0-9]{3}\.[0-9]{3}\.[0-9]{3} (MWST|TVA|IVA)$' then
    raise exception 'Für MWST ist eine gültige Schweizer MWST-Nummer erforderlich';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item
    where length(trim(coalesce(item->>'description', ''))) = 0
      or coalesce((item->>'quantity')::numeric, 0) <= 0
      or coalesce((item->>'unit_price_rappen')::bigint, -1) < 0
  ) then raise exception 'invalid invoice item'; end if;

  select coalesce(sum(round((item->>'quantity')::numeric * (item->>'unit_price_rappen')::bigint)), 0)::bigint
  into v_subtotal from jsonb_array_elements(p_items) item;
  v_tax := round(v_subtotal * p_tax_rate / 100.0)::bigint;
  if v_subtotal + v_tax <= 0 then raise exception 'invoice total must be positive'; end if;
  v_invoice_year := extract(year from p_issue_date)::integer;

  insert into public.invoice_number_counters(owner_id, invoice_year, last_value)
  values (v_owner, v_invoice_year, 1)
  on conflict (owner_id, invoice_year) do update
    set last_value = public.invoice_number_counters.last_value + 1
  returning last_value into v_sequence;

  if v_sequence > 9999999999999 then raise exception 'invoice sequence exhausted for SCOR reference'; end if;
  v_invoice_number := 'HEAV-' || v_invoice_year::text || '-' || lpad(v_sequence::text, greatest(3, length(v_sequence::text)), '0');
  v_payment_reference := public.make_creditor_reference(
    'HEAV' || v_invoice_year::text || lpad(v_sequence::text, greatest(6, length(v_sequence::text)), '0')
  );

  insert into public.invoices (
    owner_id, customer_id, project_id, invoice_number, payment_reference, customer_snapshot, issuer_snapshot,
    issue_date, due_date, tax_rate, subtotal_rappen, tax_rappen, total_rappen, notes
  ) values (
    v_owner, p_customer_id, p_project_id, v_invoice_number, v_payment_reference, v_customer_snapshot, v_issuer_snapshot,
    p_issue_date, p_due_date, p_tax_rate, v_subtotal, v_tax, v_subtotal + v_tax, coalesce(p_notes, '')
  ) returning id into v_invoice_id;

  insert into public.invoice_items (owner_id, invoice_id, position, description, quantity, unit_price_rappen)
  select v_owner, v_invoice_id, ordinality::integer, trim(item->>'description'),
    (item->>'quantity')::numeric, (item->>'unit_price_rappen')::bigint
  from jsonb_array_elements(p_items) with ordinality as rows(item, ordinality);

  insert into public.invoice_events (owner_id, invoice_id, kind)
  values (v_owner, v_invoice_id, 'created');

  return query select v_invoice_id, v_invoice_number, v_payment_reference;
end;
$$;
revoke all on function public.create_invoice(uuid, uuid, date, date, numeric, text, jsonb) from public, anon;
grant execute on function public.create_invoice(uuid, uuid, date, date, numeric, text, jsonb) to authenticated;

create table public.invoice_send_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  previous_status public.invoice_status not null,
  state text not null check (state in ('pending', 'sent', 'failed')),
  request_key uuid not null unique,
  idempotency_key text not null unique,
  provider_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index invoice_send_attempts_one_pending_idx
  on public.invoice_send_attempts(invoice_id) where state = 'pending';
alter table public.invoice_send_attempts enable row level security;
revoke all on public.invoice_send_attempts from public, anon, authenticated;

create or replace function public.record_invoice_action(
  p_invoice_id uuid,
  p_action text,
  p_recipient text default null,
  p_details jsonb default '{}'::jsonb
) returns public.invoice_status
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_previous public.invoice_status;
  v_legacy boolean;
  v_next public.invoice_status;
  v_kind text;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  select status, is_legacy into v_previous, v_legacy from public.invoices
    where id = p_invoice_id and owner_id = v_owner for update;
  if v_previous is null then raise exception 'invoice not found'; end if;
  if v_legacy then raise exception 'legacy invoice is archived and immutable'; end if;
  if p_action in ('paid', 'cancelled') and exists (
    select 1 from public.invoice_send_attempts where invoice_id = p_invoice_id and state = 'pending'
  ) then raise exception 'invoice send is in progress'; end if;

  if p_action = 'paid' then
    if v_previous not in ('sent', 'overdue') then raise exception 'invalid paid transition'; end if;
    v_next := 'paid'; v_kind := 'paid';
    update public.invoices set status = v_next, paid_at = now() where id = p_invoice_id;
  elsif p_action = 'cancelled' then
    if v_previous not in ('draft', 'sent', 'overdue') then raise exception 'invalid cancel transition'; end if;
    v_next := 'cancelled'; v_kind := 'cancelled';
    update public.invoices set status = v_next where id = p_invoice_id;
  elsif p_action = 'downloaded' then
    if v_previous = 'cancelled' then raise exception 'cancelled invoice cannot be downloaded'; end if;
    v_next := v_previous; v_kind := 'downloaded';
  elsif p_action = 'send_failed' then
    v_next := v_previous; v_kind := 'send_failed';
  else
    raise exception 'invalid invoice action';
  end if;

  insert into public.invoice_events (owner_id, invoice_id, kind, recipient, details)
  values (v_owner, p_invoice_id, v_kind, nullif(trim(p_recipient), ''), coalesce(p_details, '{}'::jsonb));
  return v_next;
end;
$$;
revoke all on function public.record_invoice_action(uuid, text, text, jsonb) from public, anon;
grant execute on function public.record_invoice_action(uuid, text, text, jsonb) to authenticated;

create function public.reserve_invoice_send(p_invoice_id uuid, p_request_key uuid)
returns table(attempt_id uuid, idempotency_key text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_previous public.invoice_status;
  v_legacy boolean;
  v_attempt uuid;
  v_key text;
  v_state text;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if p_request_key is null then raise exception 'request key is required'; end if;
  select status, is_legacy into v_previous, v_legacy from public.invoices
    where id = p_invoice_id and owner_id = v_owner for update;
  if v_previous is null then raise exception 'invoice not found'; end if;
  if v_legacy then raise exception 'legacy invoice is archived and cannot be sent'; end if;
  if v_previous not in ('draft', 'sent', 'overdue') then raise exception 'invoice cannot be sent'; end if;

  select id, invoice_send_attempts.idempotency_key, state into v_attempt, v_key, v_state
  from public.invoice_send_attempts
  where invoice_id = p_invoice_id and owner_id = v_owner and request_key = p_request_key;
  if v_state = 'sent' then return query select v_attempt, v_key; return; end if;

  v_attempt := null; v_key := null; v_state := null;
  select id, invoice_send_attempts.idempotency_key, state into v_attempt, v_key, v_state
  from public.invoice_send_attempts
  where invoice_id = p_invoice_id and owner_id = v_owner and state = 'pending';

  if v_attempt is null then
    select id, invoice_send_attempts.idempotency_key into v_attempt, v_key
    from public.invoice_send_attempts
    where invoice_id = p_invoice_id and owner_id = v_owner and request_key = p_request_key and state = 'failed';
    if v_attempt is not null then
      update public.invoice_send_attempts
      set state = 'pending', previous_status = v_previous, created_at = now(), completed_at = null
      where id = v_attempt;
    else
      v_attempt := gen_random_uuid();
      v_key := 'invoice-' || p_invoice_id::text || '-' || p_request_key::text;
      insert into public.invoice_send_attempts(id, owner_id, invoice_id, previous_status, state, request_key, idempotency_key)
      values (v_attempt, v_owner, p_invoice_id, v_previous, 'pending', p_request_key, v_key);
    end if;
  end if;
  return query select v_attempt, v_key;
end;
$$;
revoke all on function public.reserve_invoice_send(uuid, uuid) from public, anon;
grant execute on function public.reserve_invoice_send(uuid, uuid) to authenticated;

create function public.complete_invoice_send(
  p_attempt_id uuid,
  p_success boolean,
  p_recipient text,
  p_details jsonb default '{}'::jsonb
) returns public.invoice_status
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_invoice_id uuid;
  v_previous public.invoice_status;
  v_attempt_state text;
  v_current public.invoice_status;
  v_kind text;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if p_success is null then raise exception 'success flag is required'; end if;
  select invoice_id, previous_status, state into v_invoice_id, v_previous, v_attempt_state
  from public.invoice_send_attempts
  where id = p_attempt_id and owner_id = v_owner for update;
  if v_invoice_id is null then raise exception 'send attempt not found'; end if;
  select status into v_current from public.invoices
    where id = v_invoice_id and owner_id = v_owner for update;
  if v_attempt_state = 'sent' then return v_current; end if;
  if v_attempt_state <> 'pending' then raise exception 'send attempt is already completed'; end if;

  if p_success then
    if v_current <> v_previous or v_current not in ('draft', 'sent', 'overdue') then
      raise exception 'invoice status changed during send';
    end if;
    update public.invoice_send_attempts set state = 'sent', provider_id = nullif(p_details->>'resend_id', ''), completed_at = now()
      where id = p_attempt_id;
    update public.invoices set status = 'sent', sent_at = now() where id = v_invoice_id;
    v_kind := case when v_previous = 'draft' then 'sent' else 'resent' end;
    insert into public.invoice_events(owner_id, invoice_id, kind, recipient, details)
    values (v_owner, v_invoice_id, v_kind, nullif(trim(p_recipient), ''), coalesce(p_details, '{}'::jsonb));
    return 'sent';
  end if;

  update public.invoice_send_attempts set state = 'failed', completed_at = now() where id = p_attempt_id;
  insert into public.invoice_events(owner_id, invoice_id, kind, recipient, details)
  values (v_owner, v_invoice_id, 'send_failed', nullif(trim(p_recipient), ''), coalesce(p_details, '{}'::jsonb));
  return v_current;
end;
$$;
revoke all on function public.complete_invoice_send(uuid, boolean, text, jsonb) from public, anon;
grant execute on function public.complete_invoice_send(uuid, boolean, text, jsonb) to authenticated;

create function public.delete_draft_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_status public.invoice_status;
  v_legacy boolean;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  select status, is_legacy into v_status, v_legacy from public.invoices
    where id = p_invoice_id and owner_id = v_owner for update;
  if v_status is null then raise exception 'invoice not found'; end if;
  if v_legacy then raise exception 'legacy invoice is archived and cannot be deleted'; end if;
  if v_status <> 'draft' then raise exception 'only draft invoices can be deleted'; end if;
  if exists (select 1 from public.invoice_send_attempts where invoice_id = p_invoice_id and state = 'pending') then
    raise exception 'invoice send is in progress';
  end if;
  delete from public.invoices where id = p_invoice_id and owner_id = v_owner;
end;
$$;
revoke all on function public.delete_draft_invoice(uuid) from public, anon;
grant execute on function public.delete_draft_invoice(uuid) to authenticated;

create function public.delete_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  perform 1 from public.projects where id = p_project_id and owner_id = v_owner for update;
  if not found then raise exception 'project not found'; end if;
  if exists (select 1 from public.invoices where project_id = p_project_id and owner_id = v_owner) then
    raise exception 'project has invoices and cannot be deleted';
  end if;
  delete from public.projects where id = p_project_id and owner_id = v_owner;
end;
$$;
revoke all on function public.delete_project(uuid) from public, anon;
grant execute on function public.delete_project(uuid) to authenticated;

create function public.delete_customer(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if not exists (select 1 from public.customers where id = p_customer_id and owner_id = v_owner) then
    raise exception 'customer not found';
  end if;
  if exists (select 1 from public.invoices where customer_id = p_customer_id and owner_id = v_owner) then
    raise exception 'customer has invoices and cannot be deleted';
  end if;
  delete from public.projects where customer_id = p_customer_id and owner_id = v_owner;
  delete from public.customers where id = p_customer_id and owner_id = v_owner;
end;
$$;
revoke all on function public.delete_customer(uuid) from public, anon;
grant execute on function public.delete_customer(uuid) to authenticated;

-- All destructive financial operations must pass through the guarded RPCs above.
revoke delete on public.customers, public.projects from authenticated;

-- Removing a login must never cascade into destruction of accounting records.
alter table public.customers drop constraint customers_owner_id_fkey;
alter table public.customers add constraint customers_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete restrict;
alter table public.projects drop constraint projects_owner_id_fkey;
alter table public.projects add constraint projects_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete restrict;
alter table public.invoices drop constraint invoices_owner_id_fkey;
alter table public.invoices add constraint invoices_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete restrict;
alter table public.invoice_items drop constraint invoice_items_owner_id_fkey;
alter table public.invoice_items add constraint invoice_items_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete restrict;
alter table public.company_settings drop constraint company_settings_owner_id_fkey;
alter table public.company_settings add constraint company_settings_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete restrict;
alter table public.invoice_events drop constraint invoice_events_owner_id_fkey;
alter table public.invoice_events add constraint invoice_events_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete restrict;
alter table public.invoice_number_counters drop constraint invoice_number_counters_owner_id_fkey;
alter table public.invoice_number_counters add constraint invoice_number_counters_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete restrict;

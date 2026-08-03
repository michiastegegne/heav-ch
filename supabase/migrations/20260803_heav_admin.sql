-- HEAV Studio: customers, projects, invoices and secure owner-only access.
create extension if not exists pgcrypto;

create type public.project_status as enum ('planning', 'active', 'completed', 'on_hold');
create type public.invoice_status as enum ('draft', 'sent', 'paid', 'overdue', 'cancelled');

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  company text not null check (length(trim(company)) > 0),
  contact_name text default '',
  email text not null check (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  phone text default '',
  address_line1 text not null,
  postal_code text not null,
  city text not null,
  country text not null default 'Schweiz',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  title text not null check (length(trim(title)) > 0),
  description text default '',
  status public.project_status not null default 'planning',
  budget_rappen bigint not null default 0 check (budget_rappen >= 0),
  start_date date,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date >= start_date)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  invoice_number text not null check (length(trim(invoice_number)) > 0),
  issue_date date not null,
  due_date date not null,
  status public.invoice_status not null default 'draft',
  currency text not null default 'CHF' check (currency = 'CHF'),
  tax_rate numeric(5,2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  subtotal_rappen bigint not null default 0 check (subtotal_rappen >= 0),
  tax_rappen bigint not null default 0 check (tax_rappen >= 0),
  total_rappen bigint not null default 0 check (total_rappen >= 0),
  notes text default '',
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, invoice_number),
  check (due_date >= issue_date),
  check (total_rappen = subtotal_rappen + tax_rappen)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  position integer not null check (position > 0),
  description text not null check (length(trim(description)) > 0),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price_rappen bigint not null check (unit_price_rappen >= 0),
  unique (invoice_id, position)
);

create table public.company_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null default 'HEAV',
  owner_name text not null default 'Michias Tegegne',
  email text not null default 'hello@heav.ch',
  phone text default '',
  address_line1 text not null,
  postal_code text not null,
  city text not null,
  country text not null default 'Schweiz',
  iban text not null,
  vat_number text default '',
  default_tax_rate numeric(5,2) not null default 0,
  default_due_days integer not null default 30 check (default_due_days between 1 and 180),
  updated_at timestamptz not null default now()
);

create table public.invoice_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  kind text not null check (kind in ('created', 'downloaded', 'sent', 'resent', 'paid', 'cancelled', 'send_failed')),
  recipient text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index customers_owner_idx on public.customers(owner_id);
create index projects_owner_idx on public.projects(owner_id);
create index projects_customer_idx on public.projects(customer_id);
create index invoices_owner_status_idx on public.invoices(owner_id, status);
create index invoices_customer_idx on public.invoices(customer_id);
create index invoice_items_invoice_idx on public.invoice_items(invoice_id);
create index invoice_events_invoice_idx on public.invoice_events(invoice_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger customers_updated before update on public.customers for each row execute function public.set_updated_at();
create trigger projects_updated before update on public.projects for each row execute function public.set_updated_at();
create trigger invoices_updated before update on public.invoices for each row execute function public.set_updated_at();
create trigger settings_updated before update on public.company_settings for each row execute function public.set_updated_at();

alter table public.customers enable row level security;
alter table public.projects enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.company_settings enable row level security;
alter table public.invoice_events enable row level security;

create policy "owner manages customers" on public.customers for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner manages projects" on public.projects for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner manages invoices" on public.invoices for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner manages invoice items" on public.invoice_items for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner manages settings" on public.company_settings for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner reads invoice events" on public.invoice_events for select using (owner_id = auth.uid());
create policy "owner creates invoice events" on public.invoice_events for insert with check (owner_id = auth.uid());

-- Prevent cross-owner foreign-key references even when UUIDs are guessed.
create or replace function public.assert_same_owner()
returns trigger language plpgsql security invoker set search_path = public as $$
declare referenced_owner uuid;
begin
  if tg_table_name = 'projects' then
    select owner_id into referenced_owner from public.customers where id = new.customer_id;
  elsif tg_table_name = 'invoices' then
    select owner_id into referenced_owner from public.customers where id = new.customer_id;
    if new.project_id is not null and not exists (select 1 from public.projects where id = new.project_id and owner_id = new.owner_id) then
      raise exception 'project owner mismatch';
    end if;
  elsif tg_table_name = 'invoice_items' then
    select owner_id into referenced_owner from public.invoices where id = new.invoice_id;
  elsif tg_table_name = 'invoice_events' then
    select owner_id into referenced_owner from public.invoices where id = new.invoice_id;
  end if;
  if referenced_owner is null or referenced_owner <> new.owner_id then raise exception 'owner mismatch'; end if;
  return new;
end;
$$;
create trigger projects_same_owner before insert or update on public.projects for each row execute function public.assert_same_owner();
create trigger invoices_same_owner before insert or update on public.invoices for each row execute function public.assert_same_owner();
create trigger invoice_items_same_owner before insert or update on public.invoice_items for each row execute function public.assert_same_owner();
create trigger invoice_events_same_owner before insert or update on public.invoice_events for each row execute function public.assert_same_owner();

-- Atomic invoice creation prevents empty drafts when item insertion fails and
-- calculates all persisted totals from the validated line items.
create or replace function public.create_invoice(
  p_customer_id uuid,
  p_project_id uuid,
  p_invoice_number text,
  p_issue_date date,
  p_due_date date,
  p_tax_rate numeric,
  p_notes text,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_invoice_id uuid;
  v_subtotal bigint;
  v_tax bigint;
  v_item_count integer;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if not exists (select 1 from public.customers where id = p_customer_id and owner_id = v_owner) then
    raise exception 'customer not found';
  end if;
  if p_project_id is not null and not exists (
    select 1 from public.projects where id = p_project_id and owner_id = v_owner and customer_id = p_customer_id
  ) then raise exception 'project not found or customer mismatch'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'items must be an array'; end if;
  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 10 then raise exception 'one to ten items required'; end if;
  if p_due_date < p_issue_date then raise exception 'due date must not precede issue date'; end if;
  if p_tax_rate < 0 or p_tax_rate > 100 then raise exception 'invalid tax rate'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item
    where length(trim(coalesce(item->>'description', ''))) = 0
      or coalesce((item->>'quantity')::numeric, 0) <= 0
      or coalesce((item->>'unit_price_rappen')::bigint, -1) < 0
  ) then raise exception 'invalid invoice item'; end if;

  select coalesce(sum(round((item->>'quantity')::numeric * (item->>'unit_price_rappen')::bigint)), 0)::bigint
  into v_subtotal from jsonb_array_elements(p_items) item;
  v_tax := round(v_subtotal * p_tax_rate / 100.0)::bigint;

  insert into public.invoices (
    owner_id, customer_id, project_id, invoice_number, issue_date, due_date,
    tax_rate, subtotal_rappen, tax_rappen, total_rappen, notes
  ) values (
    v_owner, p_customer_id, p_project_id, trim(p_invoice_number), p_issue_date, p_due_date,
    p_tax_rate, v_subtotal, v_tax, v_subtotal + v_tax, coalesce(p_notes, '')
  ) returning id into v_invoice_id;

  insert into public.invoice_items (owner_id, invoice_id, position, description, quantity, unit_price_rappen)
  select v_owner, v_invoice_id, ordinality::integer, trim(item->>'description'),
    (item->>'quantity')::numeric, (item->>'unit_price_rappen')::bigint
  from jsonb_array_elements(p_items) with ordinality as rows(item, ordinality);

  insert into public.invoice_events (owner_id, invoice_id, kind)
  values (v_owner, v_invoice_id, 'created');
  return v_invoice_id;
end;
$$;

revoke all on function public.create_invoice(uuid, uuid, text, date, date, numeric, text, jsonb) from public, anon;
grant execute on function public.create_invoice(uuid, uuid, text, date, date, numeric, text, jsonb) to authenticated;

-- Records lifecycle changes and their audit event in one transaction. External
-- mail retries remain safe when paired with Resend's idempotency key.
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
  v_next public.invoice_status;
  v_kind text;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  select status into v_previous from public.invoices
    where id = p_invoice_id and owner_id = v_owner for update;
  if v_previous is null then raise exception 'invoice not found'; end if;

  if p_action = 'paid' then
    if v_previous not in ('sent', 'overdue') then raise exception 'invalid paid transition'; end if;
    v_next := 'paid'; v_kind := 'paid';
    update public.invoices set status = v_next, paid_at = now() where id = p_invoice_id;
  elsif p_action = 'sent' then
    if v_previous not in ('draft', 'sent', 'overdue') then raise exception 'invalid send transition'; end if;
    v_next := 'sent';
    v_kind := case when v_previous = 'draft' then 'sent' else 'resent' end;
    update public.invoices set status = v_next, sent_at = now() where id = p_invoice_id;
  elsif p_action = 'downloaded' then
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

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.customers, public.projects, public.company_settings to authenticated;
grant select on public.invoices, public.invoice_items, public.invoice_events to authenticated;

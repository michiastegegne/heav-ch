-- Hive: shared CRM engine with isolated business workspaces.
-- Existing rows are backfilled into the Michias Tegegne workspace; no business
-- records are deleted or renumbered.

create type public.workspace_role as enum ('owner', 'admin', 'member', 'accountant');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  business_name text not null check (length(trim(business_name)) between 2 and 120),
  legal_name text not null default '',
  contact_name text not null default '',
  email text not null default '' check (email = '' or email ~* '^[^@]+@[^@]+\.[^@]+$'),
  phone text not null default '',
  website_url text not null default '',
  address_line1 text not null default '',
  postal_code text not null default '',
  city text not null default '',
  country text not null default 'Schweiz',
  logo_url text not null default '',
  dark_logo_url text not null default '',
  icon_url text not null default '',
  primary_color text not null default '#090a08' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#eeeae0' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null default '#d7ff38' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  invoice_sender_name text not null default '',
  iban text not null default '',
  bank_name text not null default '',
  account_holder text not null default '',
  uid_number text not null default '',
  vat_number text not null default '',
  vat_enabled boolean not null default false,
  default_tax_rate numeric(5,2) not null default 0 check (default_tax_rate between 0 and 100),
  default_due_days integer not null default 30 check (default_due_days between 1 and 180),
  currency text not null default 'CHF' check (currency ~ '^[A-Z]{3}$'),
  invoice_prefix text not null default 'HIVE' check (invoice_prefix ~ '^[A-Z0-9-]{1,12}$'),
  invoice_number_format text not null default 'prefix-year-sequence' check (invoice_number_format = 'prefix-year-sequence'),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 160),
  description text not null default '',
  sku text not null default '',
  unit_price_rappen bigint not null default 0 check (unit_price_rappen >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index products_workspace_name_key on public.products(workspace_id, lower(name));
create index workspaces_owner_idx on public.workspaces(owner_id, status);
create index workspace_memberships_user_idx on public.workspace_memberships(user_id, workspace_id);
create index products_workspace_active_idx on public.products(workspace_id, active, name);

create trigger workspaces_updated before update on public.workspaces for each row execute function public.set_updated_at();
create trigger workspace_memberships_updated before update on public.workspace_memberships for each row execute function public.set_updated_at();
create trigger workspace_settings_updated before update on public.workspace_settings for each row execute function public.set_updated_at();
create trigger products_updated before update on public.products for each row execute function public.set_updated_at();

-- The initial owner is deliberately mapped to the photo/video workspace. Existing
-- company settings are retained for compatibility and copied into the new record.
insert into public.workspaces(owner_id, name, slug)
select owner.user_id, 'Michias Tegegne', 'michias-tegegne'
from public.studio_owners owner
on conflict (slug) do nothing;

insert into public.workspaces(owner_id, name, slug)
select owner.user_id, 'Wedding Vocals', 'wedding-vocals'
from public.studio_owners owner
where not exists (select 1 from public.workspaces where slug = 'wedding-vocals')
limit 1;

insert into public.workspaces(owner_id, name, slug)
select owner.user_id, 'Hive', 'hive'
from public.studio_owners owner
where not exists (select 1 from public.workspaces where slug = 'hive')
limit 1;

insert into public.workspace_memberships(workspace_id, user_id, role)
select workspace.id, workspace.owner_id, 'owner'::public.workspace_role
from public.workspaces workspace
on conflict (workspace_id, user_id) do nothing;

insert into public.workspace_settings(
  workspace_id, business_name, legal_name, contact_name, email, phone, website_url,
  address_line1, postal_code, city, country, iban, vat_number, vat_enabled,
  default_tax_rate, default_due_days, currency, invoice_prefix, invoice_sender_name
)
select
  workspace.id,
  workspace.name,
  coalesce(settings.company_name, workspace.name),
  coalesce(settings.owner_name, ''),
  coalesce(settings.email, ''),
  coalesce(settings.phone, ''),
  coalesce(settings.website_url, ''),
  coalesce(settings.address_line1, ''),
  coalesce(settings.postal_code, ''),
  coalesce(settings.city, ''),
  coalesce(settings.country, 'Schweiz'),
  coalesce(settings.iban, ''),
  coalesce(settings.vat_number, ''),
  length(trim(coalesce(settings.vat_number, ''))) > 0,
  coalesce(settings.default_tax_rate, 0),
  coalesce(settings.default_due_days, 30),
  'CHF',
  case workspace.slug when 'michias-tegegne' then 'MT' when 'wedding-vocals' then 'WV' else 'HIVE' end,
  coalesce(settings.company_name, workspace.name)
from public.workspaces workspace
left join public.company_settings settings on settings.owner_id = workspace.owner_id
on conflict (workspace_id) do nothing;

-- Core business records receive a required workspace context. Portal and audit
-- records are included so linked customer data cannot cross business boundaries.
alter table public.customers add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.customer_departments add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.projects add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.invoices add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.invoice_items add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.invoice_events add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.offers add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.offer_items add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.offer_events add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.customer_portal_memberships add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.customer_portal_invites add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.customer_portal_requests add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.customer_files add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.customer_reviews add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.activity_events add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.email_templates add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.email_delivery_logs add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.invoice_send_attempts add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.invoice_number_counters add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.offer_number_counters add column workspace_id uuid references public.workspaces(id) on delete restrict;

update public.customers record set workspace_id = workspace.id from public.workspaces workspace where workspace.slug = 'michias-tegegne' and workspace.owner_id = record.owner_id;
update public.customer_departments record set workspace_id = customer.workspace_id from public.customers customer where customer.id = record.customer_id;
update public.projects record set workspace_id = customer.workspace_id from public.customers customer where customer.id = record.customer_id;
update public.invoices record set workspace_id = customer.workspace_id from public.customers customer where customer.id = record.customer_id;
update public.invoice_items record set workspace_id = invoice.workspace_id from public.invoices invoice where invoice.id = record.invoice_id;
update public.invoice_events record set workspace_id = invoice.workspace_id from public.invoices invoice where invoice.id = record.invoice_id;
update public.offers record set workspace_id = customer.workspace_id from public.customers customer where customer.id = record.customer_id;
update public.offer_items record set workspace_id = offer.workspace_id from public.offers offer where offer.id = record.offer_id;
update public.offer_events record set workspace_id = offer.workspace_id from public.offers offer where offer.id = record.offer_id;
update public.customer_portal_memberships record set workspace_id = customer.workspace_id from public.customers customer where customer.id = record.customer_id;
update public.customer_portal_invites record set workspace_id = customer.workspace_id from public.customers customer where customer.id = record.customer_id;
update public.customer_portal_requests record set workspace_id = customer.workspace_id from public.customers customer where customer.id = record.customer_id;
update public.customer_files record set workspace_id = customer.workspace_id from public.customers customer where customer.id = record.customer_id;
update public.customer_reviews record set workspace_id = customer.workspace_id from public.customers customer where customer.id = record.customer_id;
update public.activity_events record set workspace_id = customer.workspace_id from public.customers customer where customer.id = record.customer_id;
update public.email_templates record set workspace_id = workspace.id from public.workspaces workspace where workspace.slug = 'michias-tegegne' and workspace.owner_id = record.owner_id;
update public.email_delivery_logs record set workspace_id = invoice.workspace_id from public.invoices invoice where invoice.id = record.invoice_id;
update public.email_delivery_logs record set workspace_id = workspace.id from public.workspaces workspace where record.workspace_id is null and workspace.slug = 'michias-tegegne' and workspace.owner_id = record.owner_id;
update public.invoice_send_attempts record set workspace_id = invoice.workspace_id from public.invoices invoice where invoice.id = record.invoice_id;
update public.invoice_number_counters record set workspace_id = workspace.id from public.workspaces workspace where workspace.slug = 'michias-tegegne' and workspace.owner_id = record.owner_id;
update public.offer_number_counters record set workspace_id = workspace.id from public.workspaces workspace where workspace.slug = 'michias-tegegne' and workspace.owner_id = record.owner_id;

-- Some audit/request rows intentionally have no customer relation. Their historic
-- owner is the only safe migration key and therefore maps to the photo workspace.
update public.customer_portal_memberships record set workspace_id = workspace.id from public.workspaces workspace where record.workspace_id is null and workspace.slug = 'michias-tegegne' and workspace.owner_id = record.owner_id;
update public.customer_portal_invites record set workspace_id = workspace.id from public.workspaces workspace where record.workspace_id is null and workspace.slug = 'michias-tegegne' and workspace.owner_id = record.owner_id;
update public.customer_portal_requests record set workspace_id = workspace.id from public.workspaces workspace where record.workspace_id is null and workspace.slug = 'michias-tegegne' and workspace.owner_id = record.owner_id;
update public.customer_files record set workspace_id = workspace.id from public.workspaces workspace where record.workspace_id is null and workspace.slug = 'michias-tegegne' and workspace.owner_id = record.owner_id;
update public.activity_events record
set workspace_id = (select id from public.workspaces where slug = 'michias-tegegne' limit 1)
where record.workspace_id is null;
update public.email_templates record set workspace_id = workspace.id from public.workspaces workspace where record.workspace_id is null and workspace.slug = 'michias-tegegne' and workspace.owner_id = record.owner_id;
update public.email_delivery_logs record set workspace_id = workspace.id from public.workspaces workspace where record.workspace_id is null and workspace.slug = 'michias-tegegne' and workspace.owner_id = record.owner_id;
update public.invoice_send_attempts record set workspace_id = workspace.id from public.workspaces workspace where record.workspace_id is null and workspace.slug = 'michias-tegegne' and workspace.owner_id = record.owner_id;
update public.invoice_number_counters record set workspace_id = workspace.id from public.workspaces workspace where record.workspace_id is null and workspace.slug = 'michias-tegegne' and workspace.owner_id = record.owner_id;
update public.offer_number_counters record set workspace_id = workspace.id from public.workspaces workspace where record.workspace_id is null and workspace.slug = 'michias-tegegne' and workspace.owner_id = record.owner_id;

alter table public.customers alter column workspace_id set not null;
alter table public.customer_departments alter column workspace_id set not null;
alter table public.projects alter column workspace_id set not null;
alter table public.invoices alter column workspace_id set not null;
alter table public.invoice_items alter column workspace_id set not null;
alter table public.invoice_events alter column workspace_id set not null;
alter table public.offers alter column workspace_id set not null;
alter table public.offer_items alter column workspace_id set not null;
alter table public.offer_events alter column workspace_id set not null;
alter table public.customer_portal_memberships alter column workspace_id set not null;
alter table public.customer_portal_invites alter column workspace_id set not null;
alter table public.customer_portal_requests alter column workspace_id set not null;
alter table public.customer_files alter column workspace_id set not null;
alter table public.customer_reviews alter column workspace_id set not null;
-- Activity events predate a consistent business key for owner-only logins. Existing
-- customer/project/invoice events are backfilled above; owner-only events remain
-- nullable until a later reporting migration assigns an explicit Hive context.
-- Keep the new column available now without blocking a safe historical migration.
-- alter table public.activity_events alter column workspace_id set not null;
alter table public.email_templates alter column workspace_id set not null;
alter table public.email_delivery_logs alter column workspace_id set not null;
alter table public.invoice_send_attempts alter column workspace_id set not null;
alter table public.invoice_number_counters alter column workspace_id set not null;
alter table public.offer_number_counters alter column workspace_id set not null;

alter table public.invoice_number_counters drop constraint invoice_number_counters_pkey;
alter table public.invoice_number_counters add primary key (workspace_id, invoice_year);
alter table public.offer_number_counters drop constraint offer_number_counters_pkey;
alter table public.offer_number_counters add primary key (workspace_id, offer_year);
alter table public.invoices drop constraint if exists invoices_owner_id_invoice_number_key;
alter table public.invoices add constraint invoices_workspace_invoice_number_key unique (workspace_id, invoice_number);
alter table public.offers drop constraint if exists offers_owner_id_offer_number_key;
alter table public.offers add constraint offers_workspace_offer_number_key unique (workspace_id, offer_number);
alter table public.invoices drop constraint if exists invoices_currency_check;
alter table public.invoices add constraint invoices_currency_check check (currency ~ '^[A-Z]{3}$');

create index customers_workspace_idx on public.customers(workspace_id, company);
create index projects_workspace_idx on public.projects(workspace_id, created_at desc);
create index invoices_workspace_idx on public.invoices(workspace_id, issue_date desc);
create index offers_workspace_idx on public.offers(workspace_id, issue_date desc);
create index customer_departments_workspace_idx on public.customer_departments(workspace_id, customer_id);
create index email_templates_workspace_idx on public.email_templates(workspace_id, template_key);
create index email_delivery_logs_workspace_idx on public.email_delivery_logs(workspace_id, created_at desc);

create or replace function public.workspace_role_allows(p_role public.workspace_role, p_required public.workspace_role)
returns boolean language sql immutable set search_path = pg_catalog, public as $$
  select case p_required
    when 'owner' then p_role = 'owner'
    when 'admin' then p_role in ('owner', 'admin')
    when 'accountant' then p_role in ('owner', 'admin', 'accountant')
    else p_role in ('owner', 'admin', 'member', 'accountant')
  end
$$;

create or replace function public.is_workspace_member(p_workspace_id uuid, p_required public.workspace_role default 'member')
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.workspace_memberships membership
    join public.workspaces workspace on workspace.id = membership.workspace_id
    where membership.workspace_id = p_workspace_id
      and membership.user_id = auth.uid()
      and workspace.status = 'active'
      and public.workspace_role_allows(membership.role, p_required)
  )
$$;
revoke all on function public.is_workspace_member(uuid, public.workspace_role) from public, anon;
grant execute on function public.is_workspace_member(uuid, public.workspace_role) to authenticated;

create or replace function public.assign_workspace_context()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_workspace uuid; v_owner uuid;
begin
  if new.workspace_id is null then
    if tg_table_name in ('projects', 'invoices', 'offers', 'customer_departments', 'customer_portal_memberships', 'customer_portal_invites', 'customer_files', 'customer_reviews') then
      select workspace_id into new.workspace_id from public.customers where id = new.customer_id;
    elsif tg_table_name in ('invoice_items', 'invoice_events', 'invoice_send_attempts') then
      select workspace_id into new.workspace_id from public.invoices where id = new.invoice_id;
    elsif tg_table_name in ('offer_items', 'offer_events') then
      select workspace_id into new.workspace_id from public.offers where id = new.offer_id;
    end if;
  end if;
  select owner_id into v_owner from public.workspaces where id = new.workspace_id;
  if v_owner is null then raise exception 'workspace required'; end if;
  new.owner_id := v_owner;
  return new;
end;
$$;

create or replace function public.assert_workspace_scope()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_workspace uuid;
begin
  if tg_table_name = 'projects' then
    select workspace_id into v_workspace from public.customers where id = new.customer_id;
    if v_workspace is distinct from new.workspace_id then raise exception 'workspace customer mismatch'; end if;
  elsif tg_table_name = 'customer_departments' then
    select workspace_id into v_workspace from public.customers where id = new.customer_id;
    if v_workspace is distinct from new.workspace_id then raise exception 'workspace customer mismatch'; end if;
  elsif tg_table_name = 'invoices' then
    select workspace_id into v_workspace from public.customers where id = new.customer_id;
    if v_workspace is distinct from new.workspace_id then raise exception 'workspace customer mismatch'; end if;
    if new.project_id is not null and not exists (select 1 from public.projects where id = new.project_id and workspace_id = new.workspace_id and customer_id = new.customer_id) then raise exception 'workspace project mismatch'; end if;
  elsif tg_table_name = 'offers' then
    select workspace_id into v_workspace from public.customers where id = new.customer_id;
    if v_workspace is distinct from new.workspace_id then raise exception 'workspace customer mismatch'; end if;
    if new.project_id is not null and not exists (select 1 from public.projects where id = new.project_id and workspace_id = new.workspace_id and customer_id = new.customer_id) then raise exception 'workspace project mismatch'; end if;
  elsif tg_table_name in ('invoice_items', 'invoice_events', 'invoice_send_attempts') then
    select workspace_id into v_workspace from public.invoices where id = new.invoice_id;
    if v_workspace is distinct from new.workspace_id then raise exception 'workspace invoice mismatch'; end if;
  elsif tg_table_name in ('offer_items', 'offer_events') then
    select workspace_id into v_workspace from public.offers where id = new.offer_id;
    if v_workspace is distinct from new.workspace_id then raise exception 'workspace offer mismatch'; end if;
  end if;
  return new;
end;
$$;

create trigger a_customers_workspace_context before insert or update on public.customers for each row execute function public.assign_workspace_context();
create trigger a_products_workspace_context before insert or update on public.products for each row execute function public.assign_workspace_context();
create trigger a_departments_workspace_context before insert or update on public.customer_departments for each row execute function public.assign_workspace_context();
create trigger a_projects_workspace_context before insert or update on public.projects for each row execute function public.assign_workspace_context();
create trigger a_invoices_workspace_context before insert or update on public.invoices for each row execute function public.assign_workspace_context();
create trigger a_invoice_items_workspace_context before insert or update on public.invoice_items for each row execute function public.assign_workspace_context();
create trigger a_invoice_events_workspace_context before insert or update on public.invoice_events for each row execute function public.assign_workspace_context();
create trigger a_invoice_attempts_workspace_context before insert or update on public.invoice_send_attempts for each row execute function public.assign_workspace_context();
create trigger a_offers_workspace_context before insert or update on public.offers for each row execute function public.assign_workspace_context();
create trigger a_offer_items_workspace_context before insert or update on public.offer_items for each row execute function public.assign_workspace_context();
create trigger a_offer_events_workspace_context before insert or update on public.offer_events for each row execute function public.assign_workspace_context();
create trigger b_departments_workspace_scope before insert or update on public.customer_departments for each row execute function public.assert_workspace_scope();
create trigger b_projects_workspace_scope before insert or update on public.projects for each row execute function public.assert_workspace_scope();
create trigger b_invoices_workspace_scope before insert or update on public.invoices for each row execute function public.assert_workspace_scope();
create trigger b_invoice_items_workspace_scope before insert or update on public.invoice_items for each row execute function public.assert_workspace_scope();
create trigger b_invoice_events_workspace_scope before insert or update on public.invoice_events for each row execute function public.assert_workspace_scope();
create trigger b_invoice_attempts_workspace_scope before insert or update on public.invoice_send_attempts for each row execute function public.assert_workspace_scope();
create trigger b_offers_workspace_scope before insert or update on public.offers for each row execute function public.assert_workspace_scope();
create trigger b_offer_items_workspace_scope before insert or update on public.offer_items for each row execute function public.assert_workspace_scope();
create trigger b_offer_events_workspace_scope before insert or update on public.offer_events for each row execute function public.assert_workspace_scope();

-- Workspace-aware invoice creation preserves all historical invoices and only
-- changes the generation path used for new documents.
create or replace function public.create_invoice(
  p_customer_id uuid,
  p_project_id uuid,
  p_issue_date date,
  p_due_date date,
  p_tax_rate numeric,
  p_notes text,
  p_items jsonb
) returns table(invoice_id uuid, invoice_number text, payment_reference text)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_workspace uuid; v_owner uuid; v_settings public.workspace_settings%rowtype;
  v_invoice_id uuid; v_year integer; v_sequence bigint; v_number text; v_reference text;
  v_customer_snapshot jsonb; v_issuer_snapshot jsonb; v_subtotal bigint; v_tax bigint; v_count integer; v_prefix_body text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select customer.workspace_id into v_workspace from public.customers customer where customer.id = p_customer_id;
  if v_workspace is null or not public.is_workspace_member(v_workspace, 'accountant') then raise exception 'workspace access required'; end if;
  select * into v_settings from public.workspace_settings where workspace_id = v_workspace;
  select owner_id into v_owner from public.workspaces where id = v_workspace;
  if p_issue_date is null or p_due_date is null or p_due_date < p_issue_date then raise exception 'valid invoice dates are required'; end if;
  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 then raise exception 'invalid tax rate'; end if;
  if p_tax_rate > 0 and (not v_settings.vat_enabled or upper(trim(coalesce(v_settings.vat_number, ''))) !~ '^CHE-[0-9]{3}\.[0-9]{3}\.[0-9]{3} (MWST|TVA|IVA)$') then raise exception 'Für MWST ist eine gültige Schweizer MWST-Nummer erforderlich'; end if;
  if p_project_id is not null and not exists (select 1 from public.projects where id = p_project_id and workspace_id = v_workspace and customer_id = p_customer_id) then raise exception 'project not found or workspace mismatch'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'items must be an array'; end if;
  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 10 then raise exception 'one to ten items required'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) item where length(trim(coalesce(item->>'description', ''))) = 0 or coalesce((item->>'quantity')::numeric, 0) <= 0 or coalesce((item->>'unit_price_rappen')::bigint, -1) < 0) then raise exception 'invalid invoice item'; end if;
  select coalesce(sum(round((item->>'quantity')::numeric * (item->>'unit_price_rappen')::bigint)), 0)::bigint into v_subtotal from jsonb_array_elements(p_items) item;
  v_tax := round(v_subtotal * p_tax_rate / 100.0)::bigint;
  if v_subtotal + v_tax <= 0 then raise exception 'invoice total must be positive'; end if;
  v_year := extract(year from p_issue_date)::integer;
  insert into public.invoice_number_counters(workspace_id, owner_id, invoice_year, last_value)
  values (v_workspace, v_owner, v_year, 1)
  on conflict (workspace_id, invoice_year) do update set last_value = public.invoice_number_counters.last_value + 1
  returning last_value into v_sequence;
  v_number := v_settings.invoice_prefix || '-' || v_year::text || '-' || lpad(v_sequence::text, greatest(3, length(v_sequence::text)), '0');
  v_prefix_body := left(regexp_replace(v_settings.invoice_prefix, '[^A-Za-z0-9]', '', 'g'), 8);
  if v_prefix_body = '' then v_prefix_body := 'HIVE'; end if;
  v_reference := public.make_creditor_reference(left(v_prefix_body || v_year::text || lpad(v_sequence::text, greatest(6, length(v_sequence::text)), '0'), 21));
  select to_jsonb(customer) into v_customer_snapshot from public.customers customer where customer.id = p_customer_id;
  v_issuer_snapshot := to_jsonb(v_settings) || jsonb_build_object('company_name', v_settings.legal_name, 'owner_name', v_settings.contact_name, 'website_url', v_settings.website_url);
  insert into public.invoices(workspace_id, owner_id, customer_id, project_id, invoice_number, payment_reference, customer_snapshot, issuer_snapshot, issue_date, due_date, currency, tax_rate, subtotal_rappen, tax_rappen, total_rappen, notes)
  values (v_workspace, v_owner, p_customer_id, p_project_id, v_number, v_reference, v_customer_snapshot, v_issuer_snapshot, p_issue_date, p_due_date, v_settings.currency, p_tax_rate, v_subtotal, v_tax, v_subtotal + v_tax, coalesce(p_notes, ''))
  returning id into v_invoice_id;
  insert into public.invoice_items(workspace_id, owner_id, invoice_id, position, description, quantity, unit_price_rappen)
  select v_workspace, v_owner, v_invoice_id, ordinality::integer, trim(item->>'description'), (item->>'quantity')::numeric, (item->>'unit_price_rappen')::bigint from jsonb_array_elements(p_items) with ordinality as rows(item, ordinality);
  insert into public.invoice_events(workspace_id, owner_id, invoice_id, kind) values (v_workspace, v_owner, v_invoice_id, 'created');
  return query select v_invoice_id, v_number, v_reference;
end;
$$;

create or replace function public.create_invoice_in_department(
  p_customer_id uuid, p_project_id uuid, p_issue_date date, p_due_date date,
  p_tax_rate numeric, p_notes text, p_items jsonb, p_department_id uuid
) returns table(invoice_id uuid, invoice_number text, payment_reference text)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_workspace uuid;
begin
  select workspace_id into v_workspace from public.customers where id = p_customer_id;
  if not exists (select 1 from public.customer_departments where id = p_department_id and customer_id = p_customer_id and workspace_id = v_workspace) then raise exception 'department workspace mismatch'; end if;
  return query select * from public.create_invoice(p_customer_id, p_project_id, p_issue_date, p_due_date, p_tax_rate, p_notes, p_items);
  update public.invoices set department_id = p_department_id where id = create_invoice_in_department.invoice_id;
end;
$$;

create or replace function public.create_workspace(
  p_name text, p_slug text, p_invoice_prefix text, p_currency text default 'CHF'
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_workspace uuid;
begin
  if not public.is_studio_owner() then raise exception 'Hive-Administration erforderlich' using errcode = '42501'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or coalesce(p_slug, '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or coalesce(p_invoice_prefix, '') !~ '^[A-Z0-9-]{1,12}$' or coalesce(p_currency, '') !~ '^[A-Z]{3}$' then raise exception 'invalid workspace data'; end if;
  insert into public.workspaces(owner_id, name, slug) values (auth.uid(), trim(p_name), p_slug) returning id into v_workspace;
  insert into public.workspace_memberships(workspace_id, user_id, role) values (v_workspace, auth.uid(), 'owner');
  insert into public.workspace_settings(workspace_id, business_name, legal_name, contact_name, invoice_sender_name, currency, invoice_prefix)
  values (v_workspace, trim(p_name), trim(p_name), '', trim(p_name), p_currency, p_invoice_prefix);
  return v_workspace;
end;
$$;
revoke all on function public.create_workspace(text, text, text, text) from public, anon;
grant execute on function public.create_workspace(text, text, text, text) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.products enable row level security;

create policy "workspace members read workspaces" on public.workspaces for select using (public.is_workspace_member(id));
create policy "workspace owners manage workspaces" on public.workspaces for update using (public.is_workspace_member(id, 'owner')) with check (public.is_workspace_member(id, 'owner'));
create policy "workspace members read memberships" on public.workspace_memberships for select using (user_id = auth.uid() or public.is_workspace_member(workspace_id, 'admin'));
create policy "workspace owners manage memberships" on public.workspace_memberships for all using (public.is_workspace_member(workspace_id, 'owner')) with check (public.is_workspace_member(workspace_id, 'owner'));
create policy "workspace members read settings" on public.workspace_settings for select using (public.is_workspace_member(workspace_id));
create policy "workspace admins manage settings" on public.workspace_settings for all using (public.is_workspace_member(workspace_id, 'admin')) with check (public.is_workspace_member(workspace_id, 'admin'));
create policy "workspace members manage products" on public.products for all using (public.is_workspace_member(workspace_id, 'accountant')) with check (public.is_workspace_member(workspace_id, 'accountant'));

-- Owner policies are replaced for the four main CRM tables. Application queries
-- still include an explicit workspace_id filter; RLS is the non-bypassable guard.
drop policy if exists "owner manages customers" on public.customers;
create policy "workspace members manage customers" on public.customers for all using (public.is_workspace_member(workspace_id, 'member')) with check (public.is_workspace_member(workspace_id, 'member'));
drop policy if exists "owner manages projects" on public.projects;
create policy "workspace members manage projects" on public.projects for all using (public.is_workspace_member(workspace_id, 'member')) with check (public.is_workspace_member(workspace_id, 'member'));
drop policy if exists "owner manages invoices" on public.invoices;
create policy "workspace accountants manage invoices" on public.invoices for all using (public.is_workspace_member(workspace_id, 'accountant')) with check (public.is_workspace_member(workspace_id, 'accountant'));
drop policy if exists "owner manages invoice items" on public.invoice_items;
create policy "workspace accountants manage invoice items" on public.invoice_items for all using (public.is_workspace_member(workspace_id, 'accountant')) with check (public.is_workspace_member(workspace_id, 'accountant'));

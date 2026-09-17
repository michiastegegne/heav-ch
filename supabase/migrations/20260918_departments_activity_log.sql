-- HEAV: customer departments and a central activity timeline.
-- A department is a scoped access boundary inside one legal customer.

create table public.customer_departments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  code text not null default '',
  contact_name text not null default '',
  contact_email text not null default '' check (contact_email = '' or contact_email ~* '^[^@]+@[^@]+\.[^@]+$'),
  contact_phone text not null default '',
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customer_departments_name_idx on public.customer_departments(customer_id, lower(name));
create unique index customer_departments_default_idx on public.customer_departments(customer_id) where is_default;
create index customer_departments_owner_idx on public.customer_departments(owner_id, customer_id, active);

create or replace function public.ensure_default_customer_department()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  insert into public.customer_departments(owner_id, customer_id, name, code, is_default)
  values (new.owner_id, new.id, 'Allgemein', 'GENERAL', true)
  on conflict do nothing;
  return new;
end;
$$;
create trigger customer_default_department after insert on public.customers for each row execute function public.ensure_default_customer_department();

insert into public.customer_departments(owner_id, customer_id, name, code, is_default)
select customer.owner_id, customer.id, 'Allgemein', 'GENERAL', true
from public.customers customer
where not exists (
  select 1 from public.customer_departments department where department.customer_id = customer.id
);

alter table public.projects add column department_id uuid;
alter table public.invoices add column department_id uuid;
alter table public.offers add column department_id uuid;
alter table public.customer_files add column department_id uuid;
alter table public.customer_reviews add column department_id uuid;
alter table public.customer_portal_memberships add column department_id uuid;

update public.projects project
set department_id = department.id
from public.customer_departments department
where department.customer_id = project.customer_id and department.is_default and project.department_id is null;
update public.invoices invoice
set department_id = department.id
from public.customer_departments department
where department.customer_id = invoice.customer_id and department.is_default and invoice.department_id is null;
update public.offers offer
set department_id = department.id
from public.customer_departments department
where department.customer_id = offer.customer_id and department.is_default and offer.department_id is null;
update public.customer_files file
set department_id = department.id
from public.customer_departments department
where department.customer_id = file.customer_id and department.is_default and file.department_id is null;
update public.customer_reviews review
set department_id = department.id
from public.customer_departments department
where department.customer_id = review.customer_id and department.is_default and review.department_id is null;
update public.customer_portal_memberships membership
set department_id = department.id
from public.customer_departments department
where department.customer_id = membership.customer_id and department.is_default and membership.department_id is null;

alter table public.projects alter column department_id set not null;
alter table public.invoices alter column department_id set not null;
alter table public.offers alter column department_id set not null;
alter table public.customer_files alter column department_id set not null;
alter table public.customer_reviews alter column department_id set not null;
alter table public.customer_portal_memberships alter column department_id set not null;

alter table public.customer_portal_invites add column if not exists department_id uuid;
update public.customer_portal_invites invite
set department_id = department.id
from public.customer_departments department
where department.customer_id = invite.customer_id and department.is_default and invite.department_id is null;
alter table public.customer_portal_invites alter column department_id set not null;
alter table public.customer_portal_invites add constraint customer_portal_invites_department_fk foreign key (department_id) references public.customer_departments(id) on delete restrict;
drop index if exists public.customer_portal_invites_open_email_idx;
create unique index customer_portal_invites_open_email_idx
  on public.customer_portal_invites(customer_id, department_id, email)
  where revoked_at is null and accepted_at is null;

alter table public.projects add constraint projects_department_fk foreign key (department_id) references public.customer_departments(id) on delete restrict;
alter table public.invoices add constraint invoices_department_fk foreign key (department_id) references public.customer_departments(id) on delete restrict;
alter table public.offers add constraint offers_department_fk foreign key (department_id) references public.customer_departments(id) on delete restrict;
alter table public.customer_files add constraint customer_files_department_fk foreign key (department_id) references public.customer_departments(id) on delete restrict;
alter table public.customer_reviews add constraint customer_reviews_department_fk foreign key (department_id) references public.customer_departments(id) on delete restrict;
alter table public.customer_portal_memberships add constraint memberships_department_fk foreign key (department_id) references public.customer_departments(id) on delete restrict;
create index projects_department_idx on public.projects(department_id, created_at desc);
create index invoices_department_idx on public.invoices(department_id, issue_date desc);
create index offers_department_idx on public.offers(department_id, issue_date desc);
create index customer_files_department_idx on public.customer_files(department_id, published_at desc);
create index memberships_department_idx on public.customer_portal_memberships(department_id, user_id, status);

create or replace function public.assert_department_scope()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  department public.customer_departments%rowtype;
  project public.projects%rowtype;
begin
  select * into department from public.customer_departments where id = new.department_id;
  if department.id is null or department.customer_id <> new.customer_id or department.owner_id <> new.owner_id or not department.active then
    raise exception 'department customer or owner mismatch';
  end if;
  if tg_table_name = 'invoices' and (to_jsonb(new)->>'project_id') is not null then
    select * into project from public.projects where id = (to_jsonb(new)->>'project_id')::uuid;
    if project.id is null or project.customer_id <> new.customer_id or project.owner_id <> new.owner_id or project.department_id <> new.department_id then
      raise exception 'project department mismatch';
    end if;
  end if;
  if tg_table_name = 'customer_files' and (to_jsonb(new)->>'project_id') is not null then
    select * into project from public.projects where id = (to_jsonb(new)->>'project_id')::uuid;
    if project.id is null or project.customer_id <> new.customer_id or project.owner_id <> new.owner_id or project.department_id <> new.department_id then
      raise exception 'file project department mismatch';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.assign_default_department()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.department_id is null then
    if tg_table_name in ('invoices', 'offers') and (to_jsonb(new)->>'project_id') is not null then
      select department_id into new.department_id from public.projects where id = (to_jsonb(new)->>'project_id')::uuid;
    end if;
    if new.department_id is null then
      select id into new.department_id
      from public.customer_departments
      where customer_id = new.customer_id and owner_id = new.owner_id and is_default and active
      limit 1;
    end if;
  end if;
  if new.department_id is null then raise exception 'active customer department required'; end if;
  return new;
end;
$$;

create trigger projects_department_default before insert on public.projects for each row execute function public.assign_default_department();
create trigger invoices_department_default before insert on public.invoices for each row execute function public.assign_default_department();
create trigger offers_department_default before insert on public.offers for each row execute function public.assign_default_department();
create trigger customer_files_department_default before insert on public.customer_files for each row execute function public.assign_default_department();
create trigger customer_reviews_department_default before insert on public.customer_reviews for each row execute function public.assign_default_department();
create trigger memberships_department_default before insert on public.customer_portal_memberships for each row execute function public.assign_default_department();
create trigger projects_department_scope before insert or update on public.projects for each row execute function public.assert_department_scope();
create trigger invoices_department_scope before insert or update on public.invoices for each row execute function public.assert_department_scope();
create trigger offers_department_scope before insert or update on public.offers for each row execute function public.assert_department_scope();
create trigger customer_files_department_scope before insert or update on public.customer_files for each row execute function public.assert_department_scope();
create trigger customer_reviews_department_scope before insert or update on public.customer_reviews for each row execute function public.assert_department_scope();
create trigger memberships_department_scope before insert or update on public.customer_portal_memberships for each row execute function public.assert_department_scope();
create trigger customer_departments_updated before update on public.customer_departments for each row execute function public.set_updated_at();

create or replace function public.assert_customer_portal_ownership()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_customer_owner uuid;
  v_project_customer uuid;
  v_project_owner uuid;
begin
  select owner_id into v_customer_owner from public.customers where id = new.customer_id;
  if v_customer_owner is null then raise exception 'customer not found'; end if;
  if tg_table_name in ('customer_portal_memberships', 'customer_files') and v_customer_owner <> new.owner_id then
    raise exception 'customer owner mismatch';
  elsif tg_table_name = 'customer_files' and (to_jsonb(new)->>'project_id') is not null then
    select customer_id, owner_id into v_project_customer, v_project_owner from public.projects where id = (to_jsonb(new)->>'project_id')::uuid;
    if v_project_owner is distinct from new.owner_id or v_project_customer is distinct from new.customer_id then raise exception 'project customer mismatch'; end if;
  elsif tg_table_name = 'customer_reviews' then
    if not exists (select 1 from public.customer_portal_memberships where customer_id = new.customer_id and department_id = new.department_id and user_id = (to_jsonb(new)->>'author_id')::uuid and status = 'active') then
      raise exception 'review author has no active department membership';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.is_active_customer_member(p_customer_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select false;
$$;
revoke all on function public.is_active_customer_member(uuid) from public, anon;
grant execute on function public.is_active_customer_member(uuid) to authenticated;

create or replace function public.is_active_customer_member(p_customer_id uuid, p_department_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.customer_portal_memberships membership
    where membership.customer_id = p_customer_id
      and membership.department_id = p_department_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  );
$$;
revoke all on function public.is_active_customer_member(uuid, uuid) from public, anon;
grant execute on function public.is_active_customer_member(uuid, uuid) to authenticated;

create or replace function public.can_download_customer_storage_object(p_bucket_id text, p_name text)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.customer_files file
    where file.storage_bucket = p_bucket_id and file.storage_path = p_name
      and file.published_at is not null and (file.expires_at is null or file.expires_at > now())
      and file.download_enabled and public.is_active_customer_member(file.customer_id, file.department_id)
  );
$$;
revoke all on function public.can_download_customer_storage_object(text, text) from public, anon;
grant execute on function public.can_download_customer_storage_object(text, text) to authenticated;

-- Replace customer-facing policies with department-scoped variants.
drop policy if exists "member reads published customer files" on public.customer_files;
drop policy if exists "member reads own customer reviews" on public.customer_reviews;
drop policy if exists "member submits pending customer review" on public.customer_reviews;
drop policy if exists "member reads own projects" on public.projects;
drop policy if exists "member reads own issued invoices" on public.invoices;
drop policy if exists "member reads own issued invoice items" on public.invoice_items;
drop policy if exists "customer reads shared offers" on public.offers;
drop policy if exists "customer reads shared offer items" on public.offer_items;
create policy "member reads published department files" on public.customer_files for select using (published_at is not null and (expires_at is null or expires_at > now()) and public.is_active_customer_member(customer_id, department_id));
create policy "member reads own department reviews" on public.customer_reviews for select using (author_id = auth.uid() and public.is_active_customer_member(customer_id, department_id));
create policy "member submits pending department review" on public.customer_reviews for insert with check (author_id = auth.uid() and status = 'pending' and published_at is null and public.is_active_customer_member(customer_id, department_id));
create policy "member reads own department projects" on public.projects for select using (public.is_active_customer_member(customer_id, department_id));
create policy "member reads own issued department invoices" on public.invoices for select using (status in ('sent', 'paid', 'overdue') and public.is_active_customer_member(customer_id, department_id));
create policy "member reads own issued department invoice items" on public.invoice_items for select using (exists (select 1 from public.invoices invoice where invoice.id = invoice_items.invoice_id and invoice.status in ('sent', 'paid', 'overdue') and public.is_active_customer_member(invoice.customer_id, invoice.department_id)));
create policy "customer reads shared department offers" on public.offers for select using (status in ('sent', 'accepted', 'expired') and public.is_active_customer_member(customer_id, department_id));
create policy "customer reads shared department offer items" on public.offer_items for select using (exists (select 1 from public.offers offer where offer.id = offer_items.offer_id and offer.status in ('sent', 'accepted', 'expired') and public.is_active_customer_member(offer.customer_id, offer.department_id)));

create policy "owner manages customer departments" on public.customer_departments for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "member reads own customer departments" on public.customer_departments for select using (exists (select 1 from public.customer_portal_memberships membership where membership.department_id = customer_departments.id and membership.user_id = auth.uid() and membership.status = 'active'));

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  department_id uuid references public.customer_departments(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_type text not null check (actor_type in ('owner', 'customer', 'system')),
  visibility text not null default 'owner' check (visibility in ('owner', 'customer')),
  event_type text not null check (length(trim(event_type)) between 3 and 80),
  entity_type text not null check (length(trim(entity_type)) between 2 and 40),
  entity_id uuid,
  summary text not null check (length(trim(summary)) between 2 and 500),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_events_owner_time_idx on public.activity_events(owner_id, created_at desc);
create index activity_events_department_time_idx on public.activity_events(department_id, created_at desc);
alter table public.activity_events enable row level security;
create policy "owner reads activity events" on public.activity_events for select using (owner_id = auth.uid());
create policy "customer reads visible department activity" on public.activity_events for select using (visibility = 'customer' and customer_id is not null and public.is_active_customer_member(customer_id, department_id));
revoke all on public.activity_events from anon;
grant select on public.activity_events to authenticated;

create or replace function public.record_activity_event(
  p_owner_id uuid, p_event_type text, p_entity_type text, p_entity_id uuid, p_summary text,
  p_customer_id uuid default null, p_department_id uuid default null, p_actor_id uuid default null,
  p_actor_type text default 'system', p_visibility text default 'owner', p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid;
begin
  if p_customer_id is not null and p_department_id is not null and not exists (select 1 from public.customer_departments where id = p_department_id and customer_id = p_customer_id and owner_id = p_owner_id) then
    raise exception 'activity department mismatch';
  end if;
  insert into public.activity_events(owner_id, customer_id, department_id, actor_id, actor_type, visibility, event_type, entity_type, entity_id, summary, metadata)
  values (p_owner_id, p_customer_id, p_department_id, p_actor_id, p_actor_type, p_visibility, p_event_type, p_entity_type, p_entity_id, trim(p_summary), coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_activity_event(uuid, text, text, uuid, text, uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated;

create or replace function public.log_activity_row()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_summary text; v_event_type text; v_entity_type text; v_customer_id uuid; v_department_id uuid; v_actor uuid := auth.uid();
begin
  if tg_table_name = 'customers' then
    v_event_type := 'customer.created'; v_entity_type := 'customer'; v_customer_id := new.id; v_summary := 'Kunde erstellt: ' || coalesce(new.company, new.contact_name, 'Ohne Namen');
  elsif tg_table_name = 'customer_departments' then
    v_event_type := 'department.created'; v_entity_type := 'department'; v_customer_id := new.customer_id; v_department_id := new.id; v_summary := 'Abteilung erstellt: ' || new.name;
  elsif tg_table_name = 'projects' then
    v_event_type := 'project.created'; v_entity_type := 'project'; v_customer_id := new.customer_id; v_department_id := new.department_id; v_summary := 'Projekt erstellt: ' || new.title;
  elsif tg_table_name = 'invoices' then
    v_event_type := 'invoice.created'; v_entity_type := 'invoice'; v_customer_id := new.customer_id; v_department_id := new.department_id; v_summary := 'Rechnung erstellt: ' || new.invoice_number;
  elsif tg_table_name = 'offers' then
    v_event_type := 'offer.created'; v_entity_type := 'offer'; v_customer_id := new.customer_id; v_department_id := new.department_id; v_summary := 'Offerte erstellt: ' || new.offer_number;
  elsif tg_table_name = 'customer_portal_memberships' then
    v_event_type := 'portal.membership.created'; v_entity_type := 'membership'; v_customer_id := new.customer_id; v_department_id := new.department_id; v_summary := 'Portalzugang eingerichtet';
  elsif tg_table_name = 'invoice_events' then
    if new.kind = 'created' then return new; end if;
    select customer_id, department_id into v_customer_id, v_department_id from public.invoices where id = new.invoice_id;
    v_event_type := 'invoice.' || new.kind; v_entity_type := 'invoice'; v_summary := 'Rechnung ' || new.kind || ': ' || coalesce(new.recipient, 'Status aktualisiert');
  elsif tg_table_name = 'offer_events' then
    if new.kind = 'created' then return new; end if;
    select customer_id, department_id into v_customer_id, v_department_id from public.offers where id = new.offer_id;
    v_event_type := 'offer.' || new.kind; v_entity_type := 'offer'; v_summary := 'Offerte ' || new.kind;
    v_actor := coalesce(new.actor_id, v_actor);
  else return new;
  end if;
  perform public.record_activity_event(new.owner_id, v_event_type, v_entity_type, coalesce(new.id, null), v_summary, v_customer_id, v_department_id, v_actor, case when v_actor = new.owner_id then 'owner' else 'customer' end, 'owner', '{}'::jsonb);
  return new;
end;
$$;

create trigger activity_customer_created after insert on public.customers for each row execute function public.log_activity_row();
create trigger activity_department_created after insert on public.customer_departments for each row execute function public.log_activity_row();
create trigger activity_project_created after insert on public.projects for each row execute function public.log_activity_row();
create trigger activity_invoice_created after insert on public.invoices for each row execute function public.log_activity_row();
create trigger activity_offer_created after insert on public.offers for each row execute function public.log_activity_row();
create trigger activity_membership_created after insert on public.customer_portal_memberships for each row execute function public.log_activity_row();
create trigger activity_invoice_event after insert on public.invoice_events for each row execute function public.log_activity_row();
create trigger activity_offer_event after insert on public.offer_events for each row execute function public.log_activity_row();

create or replace function public.record_customer_portal_login(p_customer_id uuid, p_department_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_owner uuid; v_id uuid;
begin
  if not public.is_active_customer_member(p_customer_id, p_department_id) then raise exception 'customer portal access required'; end if;
  select owner_id into v_owner from public.customer_departments where id = p_department_id and customer_id = p_customer_id;
  select public.record_activity_event(v_owner, 'portal.login', 'membership', null, 'Kunde hat sich im Portal angemeldet', p_customer_id, p_department_id, auth.uid(), 'customer', 'owner', '{}'::jsonb) into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_customer_portal_login(uuid, uuid) from public, anon;
grant execute on function public.record_customer_portal_login(uuid, uuid) to authenticated;

create or replace function public.record_owner_login()
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid; v_owner uuid := auth.uid();
begin
  if v_owner is null or not public.is_studio_owner() then raise exception 'Studio-Zugriff erforderlich'; end if;
  select public.record_activity_event(v_owner, 'owner.login', 'user', v_owner, 'Studio-Owner hat sich angemeldet', null, null, v_owner, 'owner', 'owner', '{}'::jsonb) into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_owner_login() from public, anon;
grant execute on function public.record_owner_login() to authenticated;

create or replace function public.share_customer_offer(p_offer_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_owner uuid := auth.uid(); v_offer public.offers%rowtype; v_email text;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if not public.is_studio_owner() then raise exception 'studio owner required'; end if;
  select * into v_offer from public.offers where id = p_offer_id and owner_id = v_owner for update;
  if v_offer.id is null then raise exception 'offer not found'; end if;
  if v_offer.status in ('sent', 'accepted') then return; end if;
  if v_offer.status <> 'draft' then raise exception 'offer cannot be shared'; end if;
  select coalesce(department.contact_email, customer.email) into v_email
  from public.customer_departments department
  join public.customers customer on customer.id = v_offer.customer_id
  where department.id = v_offer.department_id and department.customer_id = v_offer.customer_id and department.owner_id = v_owner and department.active;
  if v_email is null or v_email !~* '^[^@]+@[^@]+[.][^@]+$' then raise exception 'department email required'; end if;
  if not exists (select 1 from public.customer_portal_memberships membership where membership.customer_id = v_offer.customer_id and membership.department_id = v_offer.department_id and membership.status = 'active') then
    raise exception 'department portal access required';
  end if;
  update public.offers set status = 'sent' where id = v_offer.id;
  insert into public.offer_events(owner_id, offer_id, kind, actor_id) values (v_owner, v_offer.id, 'shared', v_owner);
end;
$$;
revoke all on function public.share_customer_offer(uuid) from public, anon;
grant execute on function public.share_customer_offer(uuid) to authenticated;

create or replace function public.process_customer_portal_request(
  p_request_id uuid,
  p_action text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_owner uuid := auth.uid();
  v_request public.customer_portal_requests%rowtype;
  v_customer_id uuid;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if not public.is_studio_owner() then raise exception 'studio owner required'; end if;
  if p_action not in ('accept', 'decline') then raise exception 'invalid request action'; end if;
  select * into v_request from public.customer_portal_requests where id = p_request_id and owner_id = v_owner for update;
  if v_request.id is null then raise exception 'request not found'; end if;
  if v_request.status <> 'pending' then raise exception 'request is not pending'; end if;
  if p_action = 'decline' then
    update public.customer_portal_requests set status = 'declined', reviewed_at = now() where id = v_request.id;
    return null;
  end if;
  select id into v_customer_id
  from public.customers
  where owner_id = v_owner
    and nullif(trim(email), '') is not null
    and lower(trim(email)) = lower(trim(v_request.email))
  order by created_at asc
  limit 1;
  if v_customer_id is null then
    insert into public.customers (owner_id, company, contact_name, email, phone, address_line1, postal_code, city, country)
    values (v_owner, v_request.company, v_request.contact_name, v_request.email, v_request.phone, '', '', '', 'Schweiz')
    returning id into v_customer_id;
  end if;
  update public.customer_portal_requests set status = 'accepted', customer_id = v_customer_id, reviewed_at = now() where id = v_request.id;
  return v_customer_id;
end;
$$;
revoke all on function public.process_customer_portal_request(uuid, text) from public, anon;
grant execute on function public.process_customer_portal_request(uuid, text) to authenticated;

create or replace function public.delete_invoice(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_owner uuid := auth.uid(); v_legacy boolean;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if not public.is_studio_owner() then raise exception 'studio owner required'; end if;
  select is_legacy into v_legacy from public.invoices where id = p_invoice_id and owner_id = v_owner for update;
  if v_legacy is null then raise exception 'invoice not found'; end if;
  if v_legacy then raise exception 'legacy invoice is archived and cannot be deleted'; end if;
  if exists (select 1 from public.invoice_send_attempts where invoice_id = p_invoice_id and state = 'pending') then raise exception 'invoice send is in progress'; end if;
  delete from public.invoices where id = p_invoice_id and owner_id = v_owner;
end;
$$;
revoke all on function public.delete_invoice(uuid) from public, anon;
grant execute on function public.delete_invoice(uuid) to authenticated;

create or replace function public.delete_offer(p_offer_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if not public.is_studio_owner() then raise exception 'studio owner required'; end if;
  if not exists (select 1 from public.offers where id = p_offer_id and owner_id = v_owner) then raise exception 'offer not found'; end if;
  delete from public.offers where id = p_offer_id and owner_id = v_owner;
end;
$$;
revoke all on function public.delete_offer(uuid) from public, anon;
grant execute on function public.delete_offer(uuid) to authenticated;

create or replace function public.delete_portal_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if not public.is_studio_owner() then raise exception 'studio owner required'; end if;
  delete from public.customer_portal_requests where id = p_request_id and owner_id = v_owner;
  if not found then raise exception 'portal request not found'; end if;
end;
$$;
revoke all on function public.delete_portal_request(uuid) from public, anon;
grant execute on function public.delete_portal_request(uuid) to authenticated;

create or replace function public.delete_project(p_project_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if not public.is_studio_owner() then raise exception 'studio owner required'; end if;
  if not exists (select 1 from public.projects where id = p_project_id and owner_id = v_owner) then raise exception 'project not found'; end if;
  delete from public.invoices where project_id = p_project_id and owner_id = v_owner and is_legacy = false
    and not exists (select 1 from public.invoice_send_attempts attempt where attempt.invoice_id = invoices.id and attempt.state = 'pending');
  if exists (select 1 from public.invoices where project_id = p_project_id and owner_id = v_owner) then raise exception 'project has protected invoices'; end if;
  delete from public.offers where project_id = p_project_id and owner_id = v_owner;
  delete from public.customer_files where project_id = p_project_id and owner_id = v_owner;
  delete from public.activity_events where project_id = p_project_id and owner_id = v_owner;
  delete from public.projects where id = p_project_id and owner_id = v_owner;
end;
$$;
revoke all on function public.delete_project(uuid) from public, anon;
grant execute on function public.delete_project(uuid) to authenticated;

create or replace function public.delete_customer(p_customer_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if not public.is_studio_owner() then raise exception 'studio owner required'; end if;
  if not exists (select 1 from public.customers where id = p_customer_id and owner_id = v_owner) then raise exception 'customer not found'; end if;
  if exists (
    select 1 from public.invoice_send_attempts attempt
    join public.invoices invoice on invoice.id = attempt.invoice_id
    where invoice.customer_id = p_customer_id and invoice.owner_id = v_owner and attempt.state = 'pending'
  ) then raise exception 'invoice send is in progress'; end if;
  if exists (select 1 from public.invoices where customer_id = p_customer_id and owner_id = v_owner and is_legacy) then raise exception 'legacy invoice is archived and cannot be deleted'; end if;
  delete from public.invoices where customer_id = p_customer_id and owner_id = v_owner;
  delete from public.offers where customer_id = p_customer_id and owner_id = v_owner;
  delete from public.projects where customer_id = p_customer_id and owner_id = v_owner;
  delete from public.customer_portal_requests where customer_id = p_customer_id and owner_id = v_owner;
  delete from public.activity_events where customer_id = p_customer_id and owner_id = v_owner;
  delete from public.customers where id = p_customer_id and owner_id = v_owner;
end;
$$;
revoke all on function public.delete_customer(uuid) from public, anon;
grant execute on function public.delete_customer(uuid) to authenticated;

create or replace function public.create_invoice_in_department(
  p_customer_id uuid, p_project_id uuid, p_issue_date date, p_due_date date,
  p_tax_rate numeric, p_notes text, p_items jsonb, p_department_id uuid
) returns table(invoice_id uuid, invoice_number text, payment_reference text)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  return query select * from public.create_invoice(p_customer_id, p_project_id, p_issue_date, p_due_date, p_tax_rate, p_notes, p_items);
  update public.invoices invoice set department_id = p_department_id where invoice.id = create_invoice_in_department.invoice_id;
  update public.activity_events event set department_id = p_department_id where event.entity_id = create_invoice_in_department.invoice_id and event.event_type = 'invoice.created';
end;
$$;
revoke all on function public.create_invoice_in_department(uuid, uuid, date, date, numeric, text, jsonb, uuid) from public, anon;
grant execute on function public.create_invoice_in_department(uuid, uuid, date, date, numeric, text, jsonb, uuid) to authenticated;

create or replace function public.create_offer_in_department(
  p_customer_id uuid, p_project_id uuid, p_title text, p_issue_date date, p_valid_until date,
  p_tax_rate numeric, p_notes text, p_terms text, p_items jsonb, p_department_id uuid
) returns table(offer_id uuid, offer_number text)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  return query select * from public.create_offer(p_customer_id, p_project_id, p_title, p_issue_date, p_valid_until, p_tax_rate, p_notes, p_terms, p_items);
  update public.offers offer set department_id = p_department_id where offer.id = create_offer_in_department.offer_id;
  update public.activity_events event set department_id = p_department_id where event.entity_id = create_offer_in_department.offer_id and event.event_type = 'offer.created';
end;
$$;
revoke all on function public.create_offer_in_department(uuid, uuid, text, date, date, numeric, text, text, jsonb, uuid) from public, anon;
grant execute on function public.create_offer_in_department(uuid, uuid, text, date, date, numeric, text, text, jsonb, uuid) to authenticated;

-- Customer acceptance must use the same department boundary as reads.
create or replace function public.accept_customer_offer(p_offer_id uuid)
returns timestamptz language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_user uuid := auth.uid(); v_offer public.offers%rowtype; v_accepted_at timestamptz := now();
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_offer from public.offers where id = p_offer_id for update;
  if v_offer.id is null then raise exception 'offer not found'; end if;
  if not public.is_active_customer_member(v_offer.customer_id, v_offer.department_id) then raise exception 'customer portal access required'; end if;
  if v_offer.status = 'accepted' then raise exception 'offer already accepted'; end if;
  if v_offer.status <> 'sent' then raise exception 'offer is not available for acceptance'; end if;
  if v_offer.valid_until < current_date then update public.offers set status = 'expired' where id = v_offer.id; raise exception 'offer has expired'; end if;
  update public.offers set status = 'accepted', accepted_at = v_accepted_at, accepted_by = v_user where id = v_offer.id;
  insert into public.offer_events(owner_id, offer_id, kind, actor_id, details) values (v_offer.owner_id, v_offer.id, 'accepted', v_user, jsonb_build_object('accepted_at', v_accepted_at));
  return v_accepted_at;
end;
$$;
revoke all on function public.accept_customer_offer(uuid) from public, anon;
grant execute on function public.accept_customer_offer(uuid) to authenticated;

-- Hive: bridge Clerk identities to the existing Supabase UUID ownership model.
--
-- IMPORTANT:
-- This migration is designed for a staged cutover. It preserves all existing
-- auth.users UUIDs, owner_id foreign keys and historical rows. Clerk subjects
-- are mapped to those UUIDs instead of replacing them.
--
-- Apply only after:
--   1) Clerk is configured as a Supabase Third-Party Auth provider;
--   2) the trusted Clerk issuer is known;
--   3) the initial owner mapping is reviewed;
--   4) a production backup exists.

begin;

create table if not exists public.external_auth_identities (
  issuer text not null check (length(trim(issuer)) between 8 and 500),
  subject text not null check (length(trim(subject)) between 3 and 500),
  legacy_user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null default 'oidc' check (length(trim(provider)) between 2 and 40),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (issuer, subject)
);

create index if not exists external_auth_identities_legacy_idx
  on public.external_auth_identities(legacy_user_id, active);

alter table public.external_auth_identities enable row level security;
revoke all on public.external_auth_identities from public, anon, authenticated;

create or replace function public.current_app_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_claims jsonb := auth.jwt();
  v_subject text := nullif(v_claims ->> 'sub', '');
  v_issuer text := nullif(v_claims ->> 'iss', '');
  v_legacy uuid;
begin
  if v_subject is null then
    return null;
  end if;

  -- Existing HEAV sessions use Supabase Auth UUID subjects. Keep them working.
  begin
    v_legacy := v_subject::uuid;
    if exists (select 1 from auth.users where id = v_legacy) then
      return v_legacy;
    end if;
  exception
    when invalid_text_representation then
      v_legacy := null;
  end;

  -- Third-party identities such as Clerk use string subjects and are resolved
  -- through an explicit issuer+subject mapping.
  if v_issuer is null then
    return null;
  end if;

  select identity.legacy_user_id
    into v_legacy
  from public.external_auth_identities identity
  where identity.issuer = v_issuer
    and identity.subject = v_subject
    and identity.active
  limit 1;

  return v_legacy;
end;
$$;

revoke all on function public.current_app_user_id() from public, anon;
grant execute on function public.current_app_user_id() to authenticated;

create or replace function public.is_studio_owner()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.studio_owners owner
    where owner.user_id = public.current_app_user_id()
  );
$$;

revoke all on function public.is_studio_owner() from public, anon;
grant execute on function public.is_studio_owner() to authenticated;

create or replace function public.is_workspace_member(
  p_workspace_id uuid,
  p_required public.workspace_role default 'member'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    join public.workspaces workspace on workspace.id = membership.workspace_id
    where membership.workspace_id = p_workspace_id
      and membership.user_id = public.current_app_user_id()
      and workspace.status = 'active'
      and public.workspace_role_allows(membership.role, p_required)
  )
$$;

revoke all on function public.is_workspace_member(uuid, public.workspace_role) from public, anon;
grant execute on function public.is_workspace_member(uuid, public.workspace_role) to authenticated;


-- Owner-facing and workspace-aware SECURITY DEFINER routines were historically
-- written against auth.uid(). Rewrite only routines that already contain an
-- explicit Studio-owner or workspace-membership authorization guard;
-- customer-facing RPCs without those guards are deliberately excluded.
do $hive_bridge$
declare
  v_function record;
  v_source text;
begin
  for v_function in
    select procedure.oid,
           namespace.nspname,
           procedure.proname,
           procedure.prosrc,
           pg_get_function_arguments(procedure.oid) as arguments,
           pg_get_function_result(procedure.oid) as result
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosecdef
      and procedure.prolang = (select oid from pg_language where lanname = 'plpgsql')
      and (
        position('public.is_studio_owner()' in procedure.prosrc) > 0
        or position('public.is_workspace_member(' in procedure.prosrc) > 0
      )
      and position('auth.uid()' in procedure.prosrc) > 0
  loop
    v_source := replace(
      v_function.prosrc,
      'auth.uid()',
      'public.current_app_user_id()'
    );

    execute format(
      'create or replace function %I.%I(%s) returns %s language plpgsql security definer set search_path = pg_catalog, public as %L',
      v_function.nspname,
      v_function.proname,
      v_function.arguments,
      v_function.result,
      v_source
    );
  end loop;
end;
$hive_bridge$;

-- Replace the one workspace-membership policy that still compared auth.uid()
-- directly. Other workspace policies already call is_workspace_member().
drop policy if exists "workspace members read memberships" on public.workspace_memberships;
create policy "workspace members read memberships"
on public.workspace_memberships
for select
to authenticated
using (
  user_id = public.current_app_user_id()
  or public.is_workspace_member(workspace_id, 'admin')
);

-- customer_departments had policies but RLS was never enabled in the historical
-- migration. Fix it together with workspace-aware policies so enabling RLS
-- cannot unexpectedly block the admin application.
alter table public.customer_departments enable row level security;

drop policy if exists "owner manages customer departments" on public.customer_departments;
drop policy if exists "workspace members manage customer departments" on public.customer_departments;
create policy "workspace members manage customer departments"
on public.customer_departments
for all
to authenticated
using (public.is_workspace_member(workspace_id, 'member'))
with check (public.is_workspace_member(workspace_id, 'member'));

drop policy if exists "member reads own customer departments" on public.customer_departments;
create policy "member reads own customer departments"
on public.customer_departments
for select
to authenticated
using (
  exists (
    select 1
    from public.customer_portal_memberships membership
    where membership.department_id = customer_departments.id
      and membership.user_id = public.current_app_user_id()
      and membership.status = 'active'
  )
);



-- Workspace-aware invoice mutations for Hive.
create or replace function public.record_invoice_action(
  p_invoice_id uuid,
  p_action text,
  p_recipient text default null,
  p_details jsonb default '{}'::jsonb
)
returns public.invoice_status
language plpgsql
security definer
set search_path = pg_catalog, public
as $hive_record_invoice_action$
declare
  v_workspace uuid;
  v_owner uuid;
  v_previous public.invoice_status;
  v_legacy boolean;
  v_next public.invoice_status;
  v_kind text;
begin
  select invoice.workspace_id, invoice.owner_id, invoice.status, invoice.is_legacy
    into v_workspace, v_owner, v_previous, v_legacy
  from public.invoices invoice
  where invoice.id = p_invoice_id
  for update;

  if v_workspace is null then raise exception 'invoice not found'; end if;
  if not public.is_workspace_member(v_workspace, 'accountant') then
    raise exception 'workspace accountant access required' using errcode = '42501';
  end if;
  if v_legacy then raise exception 'legacy invoice is archived and immutable'; end if;
  if p_action in ('paid', 'cancelled') and exists (
    select 1 from public.invoice_send_attempts
    where invoice_id = p_invoice_id
      and workspace_id = v_workspace
      and state = 'pending'
  ) then
    raise exception 'invoice send is in progress';
  end if;

  if p_action = 'paid' then
    if v_previous not in ('sent', 'overdue') then raise exception 'invalid paid transition'; end if;
    v_next := 'paid';
    v_kind := 'paid';
    update public.invoices
      set status = v_next, paid_at = now()
      where id = p_invoice_id and workspace_id = v_workspace;
  elsif p_action = 'cancelled' then
    if v_previous not in ('draft', 'sent', 'overdue') then raise exception 'invalid cancel transition'; end if;
    v_next := 'cancelled';
    v_kind := 'cancelled';
    update public.invoices
      set status = v_next
      where id = p_invoice_id and workspace_id = v_workspace;
  elsif p_action = 'downloaded' then
    if v_previous = 'cancelled' then raise exception 'cancelled invoice cannot be downloaded'; end if;
    v_next := v_previous;
    v_kind := 'downloaded';
  elsif p_action = 'send_failed' then
    v_next := v_previous;
    v_kind := 'send_failed';
  else
    raise exception 'invalid invoice action';
  end if;

  insert into public.invoice_events (
    workspace_id, owner_id, invoice_id, kind, recipient, details
  )
  values (
    v_workspace, v_owner, p_invoice_id, v_kind,
    nullif(trim(p_recipient), ''), coalesce(p_details, '{}'::jsonb)
  );

  return v_next;
end;
$hive_record_invoice_action$;

revoke all on function public.record_invoice_action(uuid, text, text, jsonb) from public, anon;
grant execute on function public.record_invoice_action(uuid, text, text, jsonb) to authenticated;

create or replace function public.reserve_invoice_send(
  p_invoice_id uuid,
  p_request_key uuid
)
returns table(attempt_id uuid, idempotency_key text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $hive_reserve_invoice_send$
declare
  v_workspace uuid;
  v_owner uuid;
  v_previous public.invoice_status;
  v_legacy boolean;
  v_attempt uuid;
  v_key text;
  v_state text;
begin
  if p_request_key is null then raise exception 'request key is required'; end if;

  select invoice.workspace_id, invoice.owner_id, invoice.status, invoice.is_legacy
    into v_workspace, v_owner, v_previous, v_legacy
  from public.invoices invoice
  where invoice.id = p_invoice_id
  for update;

  if v_workspace is null then raise exception 'invoice not found'; end if;
  if not public.is_workspace_member(v_workspace, 'accountant') then
    raise exception 'workspace accountant access required' using errcode = '42501';
  end if;
  if v_legacy then raise exception 'legacy invoice is archived and cannot be sent'; end if;
  if v_previous not in ('draft', 'sent', 'overdue') then raise exception 'invoice cannot be sent'; end if;

  select id, invoice_send_attempts.idempotency_key, state
    into v_attempt, v_key, v_state
  from public.invoice_send_attempts
  where invoice_id = p_invoice_id
    and workspace_id = v_workspace
    and request_key = p_request_key;

  if v_state = 'sent' then
    return query select v_attempt, v_key;
    return;
  end if;

  v_attempt := null;
  v_key := null;
  v_state := null;

  select id, invoice_send_attempts.idempotency_key, state
    into v_attempt, v_key, v_state
  from public.invoice_send_attempts
  where invoice_id = p_invoice_id
    and workspace_id = v_workspace
    and state = 'pending';

  if v_attempt is null then
    select id, invoice_send_attempts.idempotency_key
      into v_attempt, v_key
    from public.invoice_send_attempts
    where invoice_id = p_invoice_id
      and workspace_id = v_workspace
      and request_key = p_request_key
      and state = 'failed';

    if v_attempt is not null then
      update public.invoice_send_attempts
      set state = 'pending',
          previous_status = v_previous,
          created_at = now(),
          completed_at = null
      where id = v_attempt
        and workspace_id = v_workspace;
    else
      v_attempt := gen_random_uuid();
      v_key := 'invoice-' || p_invoice_id::text || '-' || p_request_key::text;
      insert into public.invoice_send_attempts(
        id, workspace_id, owner_id, invoice_id,
        previous_status, state, request_key, idempotency_key
      )
      values (
        v_attempt, v_workspace, v_owner, p_invoice_id,
        v_previous, 'pending', p_request_key, v_key
      );
    end if;
  end if;

  return query select v_attempt, v_key;
end;
$hive_reserve_invoice_send$;

revoke all on function public.reserve_invoice_send(uuid, uuid) from public, anon;
grant execute on function public.reserve_invoice_send(uuid, uuid) to authenticated;

create or replace function public.complete_invoice_send(
  p_attempt_id uuid,
  p_success boolean,
  p_recipient text,
  p_details jsonb default '{}'::jsonb
)
returns public.invoice_status
language plpgsql
security definer
set search_path = pg_catalog, public
as $hive_complete_invoice_send$
declare
  v_workspace uuid;
  v_owner uuid;
  v_invoice_id uuid;
  v_previous public.invoice_status;
  v_attempt_state text;
  v_current public.invoice_status;
  v_kind text;
begin
  if p_success is null then raise exception 'success flag is required'; end if;

  select attempt.workspace_id, attempt.owner_id, attempt.invoice_id,
         attempt.previous_status, attempt.state
    into v_workspace, v_owner, v_invoice_id, v_previous, v_attempt_state
  from public.invoice_send_attempts attempt
  where attempt.id = p_attempt_id
  for update;

  if v_invoice_id is null then raise exception 'send attempt not found'; end if;
  if not public.is_workspace_member(v_workspace, 'accountant') then
    raise exception 'workspace accountant access required' using errcode = '42501';
  end if;

  select invoice.status
    into v_current
  from public.invoices invoice
  where invoice.id = v_invoice_id
    and invoice.workspace_id = v_workspace
  for update;

  if v_attempt_state = 'sent' then return v_current; end if;
  if v_attempt_state <> 'pending' then raise exception 'send attempt is already completed'; end if;

  if p_success then
    if v_current <> v_previous or v_current not in ('draft', 'sent', 'overdue') then
      raise exception 'invoice status changed during send';
    end if;

    update public.invoice_send_attempts
      set state = 'sent',
          provider_id = nullif(p_details->>'resend_id', ''),
          completed_at = now()
      where id = p_attempt_id
        and workspace_id = v_workspace;

    update public.invoices
      set status = 'sent', sent_at = now()
      where id = v_invoice_id
        and workspace_id = v_workspace;

    v_kind := case when v_previous = 'draft' then 'sent' else 'resent' end;

    insert into public.invoice_events(
      workspace_id, owner_id, invoice_id, kind, recipient, details
    )
    values (
      v_workspace, v_owner, v_invoice_id, v_kind,
      nullif(trim(p_recipient), ''), coalesce(p_details, '{}'::jsonb)
    );

    return 'sent';
  end if;

  update public.invoice_send_attempts
    set state = 'failed', completed_at = now()
    where id = p_attempt_id
      and workspace_id = v_workspace;

  insert into public.invoice_events(
    workspace_id, owner_id, invoice_id, kind, recipient, details
  )
  values (
    v_workspace, v_owner, v_invoice_id, 'send_failed',
    nullif(trim(p_recipient), ''), coalesce(p_details, '{}'::jsonb)
  );

  return v_current;
end;
$hive_complete_invoice_send$;

revoke all on function public.complete_invoice_send(uuid, boolean, text, jsonb) from public, anon;
grant execute on function public.complete_invoice_send(uuid, boolean, text, jsonb) to authenticated;

create or replace function public.delete_draft_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $hive_delete_draft_invoice$
declare
  v_workspace uuid;
  v_status public.invoice_status;
  v_legacy boolean;
begin
  select invoice.workspace_id, invoice.status, invoice.is_legacy
    into v_workspace, v_status, v_legacy
  from public.invoices invoice
  where invoice.id = p_invoice_id
  for update;

  if v_workspace is null then raise exception 'invoice not found'; end if;
  if not public.is_workspace_member(v_workspace, 'accountant') then
    raise exception 'workspace accountant access required' using errcode = '42501';
  end if;
  if v_legacy then raise exception 'legacy invoice is archived and cannot be deleted'; end if;
  if v_status <> 'draft' then raise exception 'only draft invoices can be deleted'; end if;

  if exists (
    select 1 from public.invoice_send_attempts
    where invoice_id = p_invoice_id
      and workspace_id = v_workspace
      and state = 'pending'
  ) then
    raise exception 'invoice send is in progress';
  end if;

  delete from public.invoices
  where id = p_invoice_id
    and workspace_id = v_workspace;
end;
$hive_delete_draft_invoice$;

revoke all on function public.delete_draft_invoice(uuid) from public, anon;
grant execute on function public.delete_draft_invoice(uuid) to authenticated;


-- Workspace-aware offer creation for Hive. The legacy create_offer routine
-- remains untouched for the old HEAV app during the migration window.
create or replace function public.create_workspace_offer(
  p_workspace_id uuid,
  p_customer_id uuid,
  p_project_id uuid,
  p_title text,
  p_issue_date date,
  p_valid_until date,
  p_tax_rate numeric,
  p_notes text,
  p_terms text,
  p_items jsonb
)
returns table(offer_id uuid, offer_number text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $hive_create_offer$
declare
  v_owner uuid;
  v_settings public.workspace_settings%rowtype;
  v_offer_id uuid;
  v_year integer;
  v_sequence bigint;
  v_number text;
  v_subtotal bigint;
  v_tax bigint;
begin
  if not public.is_workspace_member(p_workspace_id, 'accountant') then
    raise exception 'workspace accountant access required' using errcode = '42501';
  end if;

  if p_issue_date is null or p_valid_until is null or p_valid_until < p_issue_date then
    raise exception 'valid offer dates are required';
  end if;
  if length(trim(coalesce(p_title, ''))) < 2 then raise exception 'offer title is required'; end if;
  if length(trim(coalesce(p_terms, ''))) < 20 then raise exception 'offer terms are required'; end if;
  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 then raise exception 'invalid tax rate'; end if;

  select workspace.owner_id into v_owner
  from public.workspaces workspace
  where workspace.id = p_workspace_id and workspace.status = 'active';
  if v_owner is null then raise exception 'workspace not found'; end if;

  select * into v_settings
  from public.workspace_settings
  where workspace_id = p_workspace_id;

  if not exists (
    select 1 from public.customers
    where id = p_customer_id and workspace_id = p_workspace_id
  ) then
    raise exception 'customer not found';
  end if;

  if p_project_id is not null and not exists (
    select 1 from public.projects
    where id = p_project_id
      and workspace_id = p_workspace_id
      and customer_id = p_customer_id
  ) then
    raise exception 'project not found or customer mismatch';
  end if;

  v_subtotal := public.validated_offer_subtotal(p_items);
  v_tax := round(v_subtotal * p_tax_rate / 100.0)::bigint;
  v_year := extract(year from p_issue_date)::integer;

  insert into public.offer_number_counters(
    workspace_id, owner_id, offer_year, last_value
  )
  values (p_workspace_id, v_owner, v_year, 1)
  on conflict (workspace_id, offer_year)
  do update set last_value = public.offer_number_counters.last_value + 1
  returning last_value into v_sequence;

  v_number := v_settings.invoice_prefix || '-O-' || v_year::text || '-' ||
    lpad(v_sequence::text, greatest(3, length(v_sequence::text)), '0');

  insert into public.offers(
    workspace_id, owner_id, customer_id, project_id, offer_number,
    title, issue_date, valid_until, notes, terms,
    subtotal_rappen, tax_rappen, total_rappen
  )
  values (
    p_workspace_id, v_owner, p_customer_id, p_project_id, v_number,
    trim(p_title), p_issue_date, p_valid_until, coalesce(p_notes, ''),
    trim(p_terms), v_subtotal, v_tax, v_subtotal + v_tax
  )
  returning id into v_offer_id;

  insert into public.offer_items(
    workspace_id, owner_id, offer_id, position, description, quantity, unit_price_rappen
  )
  select
    p_workspace_id, v_owner, v_offer_id, ordinality::integer,
    trim(item->>'description'), (item->>'quantity')::numeric,
    (item->>'unit_price_rappen')::bigint
  from jsonb_array_elements(p_items) with ordinality as rows(item, ordinality);

  insert into public.offer_events(
    workspace_id, owner_id, offer_id, kind, actor_id
  )
  values (
    p_workspace_id, v_owner, v_offer_id, 'created', v_owner
  );

  return query select v_offer_id, v_number;
end;
$hive_create_offer$;

revoke all on function public.create_workspace_offer(uuid, uuid, uuid, text, date, date, numeric, text, text, jsonb) from public, anon;
grant execute on function public.create_workspace_offer(uuid, uuid, uuid, text, date, date, numeric, text, text, jsonb) to authenticated;

-- SaaS-safe project deletion for the new Hive application.
-- Financial documents are never deleted implicitly with a project.
create or replace function public.delete_workspace_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $hive_project_delete$
declare
  v_workspace uuid;
begin
  select project.workspace_id
    into v_workspace
  from public.projects project
  where project.id = p_project_id
  for update;

  if v_workspace is null then
    raise exception 'project not found';
  end if;

  if not public.is_workspace_member(v_workspace, 'admin') then
    raise exception 'workspace admin access required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.invoices invoice
    where invoice.project_id = p_project_id
      and invoice.workspace_id = v_workspace
  ) or exists (
    select 1 from public.offers offer
    where offer.project_id = p_project_id
      and offer.workspace_id = v_workspace
  ) then
    raise exception 'project has financial documents';
  end if;

  delete from public.customer_files
  where project_id = p_project_id
    and workspace_id = v_workspace;

  delete from public.activity_events
  where project_id = p_project_id
    and workspace_id = v_workspace;

  delete from public.projects
  where id = p_project_id
    and workspace_id = v_workspace;
end;
$hive_project_delete$;

revoke all on function public.delete_workspace_project(uuid) from public, anon;
grant execute on function public.delete_workspace_project(uuid) to authenticated;


create or replace function public.delete_workspace_customer(
  p_customer_id uuid,
  p_workspace_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $hive_customer_delete$
declare
  v_workspace uuid;
begin
  select customer.workspace_id
    into v_workspace
  from public.customers customer
  where customer.id = p_customer_id
    and customer.workspace_id = p_workspace_id
  for update;

  if v_workspace is null then
    raise exception 'customer not found';
  end if;

  if not public.is_workspace_member(v_workspace, 'admin') then
    raise exception 'workspace admin access required' using errcode = '42501';
  end if;

  if exists (select 1 from public.projects where customer_id = p_customer_id and workspace_id = v_workspace)
    or exists (select 1 from public.invoices where customer_id = p_customer_id and workspace_id = v_workspace)
    or exists (select 1 from public.offers where customer_id = p_customer_id and workspace_id = v_workspace)
    or exists (select 1 from public.customer_portal_memberships where customer_id = p_customer_id and workspace_id = v_workspace)
    or exists (select 1 from public.customer_portal_invites where customer_id = p_customer_id and workspace_id = v_workspace)
    or exists (select 1 from public.customer_files where customer_id = p_customer_id and workspace_id = v_workspace)
    or exists (select 1 from public.customer_reviews where customer_id = p_customer_id and workspace_id = v_workspace)
  then
    raise exception 'customer has linked records';
  end if;

  delete from public.customers
  where id = p_customer_id
    and workspace_id = v_workspace;
end;
$hive_customer_delete$;

revoke all on function public.delete_workspace_customer(uuid, uuid) from public, anon;
grant execute on function public.delete_workspace_customer(uuid, uuid) to authenticated;

commit;

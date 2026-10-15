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
do $
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
$;

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


-- SaaS-safe project deletion for the new Hive application.
-- Financial documents are never deleted implicitly with a project.
create or replace function public.delete_workspace_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $
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
$;

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
as $
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
$;

revoke all on function public.delete_workspace_customer(uuid, uuid) from public, anon;
grant execute on function public.delete_workspace_customer(uuid, uuid) to authenticated;

commit;

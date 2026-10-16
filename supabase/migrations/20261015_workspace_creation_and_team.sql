-- Hive preview workspace creation and team management.
-- New workspaces created from the preview are intentionally isolated with a
-- hive-dev-* slug so they cannot be confused with production workspaces.

begin;

create or replace function public.create_hive_preview_workspace(
  p_name text,
  p_invoice_prefix text default 'HIVE'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user uuid := public.current_app_user_id();
  v_workspace uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_slug_base text;
  v_slug text;
  v_prefix text := upper(trim(coalesce(p_invoice_prefix, 'HIVE')));
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'business name must contain 2 to 120 characters';
  end if;

  if v_prefix !~ '^[A-Z0-9-]{1,12}$' then
    raise exception 'invalid invoice prefix';
  end if;

  v_slug_base := lower(regexp_replace(v_name, '[^A-Za-z0-9]+', '-', 'g'));
  v_slug_base := regexp_replace(v_slug_base, '(^-+|-+$)', '', 'g');
  if v_slug_base = '' then v_slug_base := 'business'; end if;
  v_slug_base := left(v_slug_base, 70);
  v_slug := 'hive-dev-' || v_slug_base || '-' ||
    left(replace(gen_random_uuid()::text, '-', ''), 8);

  insert into public.workspaces(owner_id, name, slug, status)
  values (v_user, v_name, v_slug, 'active')
  returning id into v_workspace;

  insert into public.workspace_memberships(workspace_id, user_id, role)
  values (v_workspace, v_user, 'owner');

  insert into public.workspace_settings(
    workspace_id,
    business_name,
    legal_name,
    contact_name,
    email,
    invoice_sender_name,
    invoice_prefix,
    currency,
    country
  )
  select
    v_workspace,
    v_name,
    v_name,
    coalesce(nullif(trim(raw_user_meta_data->>'full_name'), ''), ''),
    coalesce(email, ''),
    v_name,
    v_prefix,
    'CHF',
    'Schweiz'
  from auth.users
  where id = v_user;

  if not found then
    raise exception 'mapped user does not exist';
  end if;

  return v_workspace;
end;
$$;

revoke all on function public.create_hive_preview_workspace(text, text)
  from public, anon;
grant execute on function public.create_hive_preview_workspace(text, text)
  to authenticated;

create or replace function public.list_workspace_members(p_workspace_id uuid)
returns table(
  membership_id uuid,
  user_id uuid,
  role public.workspace_role,
  email text,
  display_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.is_workspace_member(p_workspace_id, 'admin') then
    raise exception 'workspace admin access required' using errcode = '42501';
  end if;

  return query
    select
      membership.id,
      membership.user_id,
      membership.role,
      coalesce(account.email, ''),
      coalesce(
        nullif(trim(account.raw_user_meta_data->>'full_name'), ''),
        nullif(trim(account.raw_user_meta_data->>'name'), ''),
        split_part(coalesce(account.email, ''), '@', 1)
      ),
      membership.created_at
    from public.workspace_memberships membership
    join auth.users account on account.id = membership.user_id
    where membership.workspace_id = p_workspace_id
    order by
      case membership.role
        when 'owner' then 1
        when 'admin' then 2
        when 'accountant' then 3
        else 4
      end,
      membership.created_at;
end;
$$;

revoke all on function public.list_workspace_members(uuid) from public, anon;
grant execute on function public.list_workspace_members(uuid) to authenticated;

create or replace function public.add_workspace_member_by_email(
  p_workspace_id uuid,
  p_email text,
  p_role public.workspace_role
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_target uuid;
  v_membership uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not public.is_workspace_member(p_workspace_id, 'owner') then
    raise exception 'workspace owner access required' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'owner role cannot be assigned';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email';
  end if;

  select id into v_target
  from auth.users
  where lower(email) = v_email
  order by created_at
  limit 1;

  if v_target is null then
    raise exception 'user must sign in to Hive once before being added';
  end if;

  if exists (
    select 1
    from public.workspaces workspace
    where workspace.id = p_workspace_id
      and workspace.owner_id = v_target
  ) then
    raise exception 'workspace owner role cannot be changed';
  end if;

  insert into public.workspace_memberships(workspace_id, user_id, role)
  values (p_workspace_id, v_target, p_role)
  on conflict (workspace_id, user_id)
  do update set role = excluded.role, updated_at = now()
  returning id into v_membership;

  return v_membership;
end;
$$;

revoke all on function public.add_workspace_member_by_email(uuid, text, public.workspace_role)
  from public, anon;
grant execute on function public.add_workspace_member_by_email(uuid, text, public.workspace_role)
  to authenticated;

create or replace function public.update_workspace_member_role(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role public.workspace_role
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_workspace_member(p_workspace_id, 'owner') then
    raise exception 'workspace owner access required' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'owner role cannot be assigned';
  end if;
  if exists (
    select 1 from public.workspaces
    where id = p_workspace_id and owner_id = p_user_id
  ) then
    raise exception 'workspace owner role cannot be changed';
  end if;

  update public.workspace_memberships
  set role = p_role, updated_at = now()
  where workspace_id = p_workspace_id
    and user_id = p_user_id;

  if not found then raise exception 'workspace member not found'; end if;
end;
$$;

revoke all on function public.update_workspace_member_role(uuid, uuid, public.workspace_role)
  from public, anon;
grant execute on function public.update_workspace_member_role(uuid, uuid, public.workspace_role)
  to authenticated;

create or replace function public.remove_workspace_member(
  p_workspace_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_workspace_member(p_workspace_id, 'owner') then
    raise exception 'workspace owner access required' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.workspaces
    where id = p_workspace_id and owner_id = p_user_id
  ) then
    raise exception 'workspace owner cannot be removed';
  end if;

  delete from public.workspace_memberships
  where workspace_id = p_workspace_id
    and user_id = p_user_id;

  if not found then raise exception 'workspace member not found'; end if;
end;
$$;

revoke all on function public.remove_workspace_member(uuid, uuid)
  from public, anon;
grant execute on function public.remove_workspace_member(uuid, uuid)
  to authenticated;

commit;

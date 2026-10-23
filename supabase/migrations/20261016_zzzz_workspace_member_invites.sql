-- Secure workspace team invitations for Supabase + Clerk identities.
--
-- Email is delivery metadata only. Authorization comes from:
--   owner-created high-entropy invite token + authenticated current identity.
-- Raw invite tokens are never stored.

begin;

create table if not exists public.workspace_member_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null default '' check (length(email) <= 320),
  role public.workspace_role not null,
  invited_by uuid not null references public.app_users(id) on delete restrict,
  token_hash text not null unique check (length(token_hash) = 64),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.app_users(id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (role <> 'owner'::public.workspace_role)
);

create index if not exists workspace_member_invites_workspace_idx
  on public.workspace_member_invites(workspace_id, created_at desc);

create unique index if not exists workspace_member_invites_active_email_idx
  on public.workspace_member_invites(workspace_id, lower(email))
  where accepted_at is null and revoked_at is null;

alter table public.workspace_member_invites enable row level security;
revoke all on public.workspace_member_invites from public, anon, authenticated;

create or replace function public.create_workspace_member_invite(
  p_workspace_id uuid,
  p_email text,
  p_role public.workspace_role
)
returns table(
  invite_id uuid,
  token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $hive_create_workspace_invite$
declare
  v_actor uuid := public.current_app_user_id();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_token text;
  v_invite uuid;
  v_expires timestamptz := now() + interval '7 days';
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not public.is_workspace_member(p_workspace_id, 'owner') then
    raise exception 'workspace owner access required' using errcode = '42501';
  end if;

  if p_role = 'owner' then
    raise exception 'owner role cannot be assigned' using errcode = '22023';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;

  -- A fresh invite replaces any older still-open invite for the same address.
  update public.workspace_member_invites
     set revoked_at = now(),
         updated_at = now()
   where workspace_id = p_workspace_id
     and lower(email) = v_email
     and accepted_at is null
     and revoked_at is null;

  v_token := 'hive_team_' || encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.workspace_member_invites(
    workspace_id,
    email,
    role,
    invited_by,
    token_hash,
    expires_at
  )
  values (
    p_workspace_id,
    v_email,
    p_role,
    v_actor,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_expires
  )
  returning id into v_invite;

  return query select v_invite, v_token, v_expires;
end;
$hive_create_workspace_invite$;

revoke all on function public.create_workspace_member_invite(
  uuid, text, public.workspace_role
) from public, anon;
grant execute on function public.create_workspace_member_invite(
  uuid, text, public.workspace_role
) to authenticated;

create or replace function public.claim_workspace_member_invite(p_token text)
returns table(
  membership_id uuid,
  workspace_id uuid,
  role public.workspace_role
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $hive_claim_workspace_invite$
declare
  v_actor uuid := public.current_app_user_id();
  v_invite public.workspace_member_invites%rowtype;
  v_membership uuid;
begin
  if p_token is null
     or length(p_token) <> 74
     or left(p_token, 10) <> 'hive_team_' then
    raise exception 'invalid or expired team invite' using errcode = '22023';
  end if;

  select invite.*
    into v_invite
  from public.workspace_member_invites invite
  where invite.token_hash =
        encode(extensions.digest(p_token, 'sha256'), 'hex')
    and invite.accepted_at is null
    and invite.revoked_at is null
    and invite.expires_at > now()
  for update;

  if not found then
    raise exception 'invalid or expired team invite' using errcode = '22023';
  end if;

  -- A genuinely new trusted third-party identity can join an invited workspace
  -- without first creating an unrelated empty business.
  if v_actor is null then
    v_actor := public.provision_current_app_user('', '');
  end if;

  if v_actor is null then
    raise exception 'Hive identity could not be provisioned';
  end if;

  if exists (
    select 1
    from public.workspaces workspace
    where workspace.id = v_invite.workspace_id
      and workspace.owner_id = v_actor
  ) then
    raise exception 'workspace owner is already a member'
      using errcode = '23505';
  end if;

  insert into public.workspace_memberships(
    workspace_id,
    user_id,
    role
  )
  values (
    v_invite.workspace_id,
    v_actor,
    v_invite.role
  )
  on conflict (workspace_id, user_id)
  do update set
    role = excluded.role,
    updated_at = now()
  returning id into v_membership;

  update public.workspace_member_invites
     set accepted_at = now(),
         accepted_by = v_actor,
         updated_at = now()
   where id = v_invite.id;

  return query
    select v_membership, v_invite.workspace_id, v_invite.role;
end;
$hive_claim_workspace_invite$;

revoke all on function public.claim_workspace_member_invite(text)
  from public, anon;
grant execute on function public.claim_workspace_member_invite(text)
  to authenticated;

create or replace function public.revoke_workspace_member_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $hive_revoke_workspace_invite$
declare
  v_workspace uuid;
begin
  select invite.workspace_id
    into v_workspace
  from public.workspace_member_invites invite
  where invite.id = p_invite_id
    and invite.accepted_at is null
    and invite.revoked_at is null;

  if v_workspace is null then
    raise exception 'workspace invite not found';
  end if;

  if not public.is_workspace_member(v_workspace, 'owner') then
    raise exception 'workspace owner access required' using errcode = '42501';
  end if;

  update public.workspace_member_invites
     set revoked_at = now(),
         updated_at = now()
   where id = p_invite_id;
end;
$hive_revoke_workspace_invite$;

revoke all on function public.revoke_workspace_member_invite(uuid)
  from public, anon;
grant execute on function public.revoke_workspace_member_invite(uuid)
  to authenticated;

create or replace function public.list_workspace_member_invites(p_workspace_id uuid)
returns table(
  invite_id uuid,
  email text,
  role public.workspace_role,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $hive_list_workspace_invites$
begin
  if not public.is_workspace_member(p_workspace_id, 'admin') then
    raise exception 'workspace admin access required' using errcode = '42501';
  end if;

  return query
    select
      invite.id,
      invite.email,
      invite.role,
      invite.expires_at,
      invite.accepted_at,
      invite.revoked_at,
      invite.created_at
    from public.workspace_member_invites invite
    where invite.workspace_id = p_workspace_id
    order by invite.created_at desc;
end;
$hive_list_workspace_invites$;

revoke all on function public.list_workspace_member_invites(uuid)
  from public, anon;
grant execute on function public.list_workspace_member_invites(uuid)
  to authenticated;

commit;

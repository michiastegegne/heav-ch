-- Explicit onboarding for genuinely new Clerk identities.
--
-- This is intentionally separate from legacy account linking:
-- - existing/legacy Hive accounts must use the one-time migration code;
-- - a new Clerk identity can provision one internal app_user + first workspace;
-- - the operation is atomic and idempotent for a just-provisioned Clerk-only user;
-- - caller-supplied profile text is never used to authorize access.

begin;

create or replace function public.provision_current_hive_account(
  p_email text default '',
  p_display_name text default '',
  p_business_name text default '',
  p_invoice_prefix text default 'HIVE'
)
returns table(
  app_user_id uuid,
  workspace_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $hive_provision_account$
declare
  v_user uuid := public.current_app_user_id();
  v_workspace uuid;
  v_legacy boolean := false;
  v_name text := trim(coalesce(p_business_name, ''));
  v_prefix text := upper(trim(coalesce(p_invoice_prefix, 'HIVE')));
begin
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'business name must contain 2 to 120 characters'
      using errcode = '22023';
  end if;

  if v_prefix !~ '^[A-Z0-9-]{1,12}$' then
    raise exception 'invalid invoice prefix'
      using errcode = '22023';
  end if;

  if v_user is not null then
    select account.legacy_auth_user
      into v_legacy
    from public.app_users account
    where account.id = v_user
      and account.status = 'active';

    if not found then
      raise exception 'mapped Hive user does not exist';
    end if;

    -- Existing Hive/Supabase users must preserve their historical identity and
    -- use the explicit one-time identity-link flow instead of onboarding.
    if v_legacy then
      raise exception 'existing Hive account must be linked, not provisioned'
        using errcode = '42501';
    end if;

    -- Retry-safe: a Clerk-only account that already completed onboarding gets
    -- the existing first workspace back instead of creating another tenant.
    select membership.workspace_id
      into v_workspace
    from public.workspace_memberships membership
    join public.workspaces workspace
      on workspace.id = membership.workspace_id
    where membership.user_id = v_user
      and membership.role = 'owner'
      and workspace.status = 'active'
    order by membership.created_at
    limit 1;

    if v_workspace is not null then
      return query select v_user, v_workspace;
      return;
    end if;
  else
    v_user := public.provision_current_app_user(
      p_email,
      p_display_name
    );
  end if;

  if v_user is null then
    raise exception 'Hive account could not be provisioned';
  end if;

  -- create_hive_preview_workspace resolves the same actor through
  -- current_app_user_id(), so ownership and membership remain inside the normal
  -- RLS/authorization model.
  v_workspace := public.create_hive_preview_workspace(
    v_name,
    v_prefix
  );

  return query select v_user, v_workspace;
end;
$hive_provision_account$;

revoke all on function public.provision_current_hive_account(
  text, text, text, text
) from public, anon;

grant execute on function public.provision_current_hive_account(
  text, text, text, text
) to authenticated;

commit;

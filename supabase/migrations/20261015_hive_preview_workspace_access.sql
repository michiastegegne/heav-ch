-- Dynamic preview workspaces without weakening production workspace isolation.

begin;

create or replace function public.is_hive_preview_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
    select 1
    from public.workspaces workspace
    join public.workspace_memberships membership
      on membership.workspace_id=workspace.id
    where workspace.id=p_workspace_id
      and workspace.slug like 'hive-dev-%'
      and workspace.status='active'
      and membership.user_id=public.current_app_user_id()
  );
$$;

revoke all on function public.is_hive_preview_workspace(uuid) from public,anon;
grant execute on function public.is_hive_preview_workspace(uuid) to authenticated;

commit;

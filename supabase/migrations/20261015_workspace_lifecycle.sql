-- Safe workspace rename/archive lifecycle for Hive preview.

begin;

create or replace function public.rename_workspace_business(
  p_workspace_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
begin
  if not public.is_workspace_member(p_workspace_id, 'admin') then
    raise exception 'workspace admin access required' using errcode='42501';
  end if;
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'business name must contain 2 to 120 characters';
  end if;

  update public.workspaces
  set name=v_name, updated_at=now()
  where id=p_workspace_id
    and status='active';

  if not found then raise exception 'workspace not found'; end if;

  update public.workspace_settings
  set business_name=v_name, updated_at=now()
  where workspace_id=p_workspace_id;
end;
$$;

revoke all on function public.rename_workspace_business(uuid,text)
  from public, anon;
grant execute on function public.rename_workspace_business(uuid,text)
  to authenticated;

create or replace function public.archive_hive_preview_workspace(
  p_workspace_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_slug text;
begin
  if not public.is_workspace_member(p_workspace_id, 'owner') then
    raise exception 'workspace owner access required' using errcode='42501';
  end if;

  select slug into v_slug
  from public.workspaces
  where id=p_workspace_id
    and status='active'
  for update;

  if v_slug is null then raise exception 'workspace not found'; end if;
  if v_slug not like 'hive-dev-%' then
    raise exception 'only Hive preview workspaces can be archived here';
  end if;

  update public.workspaces
  set status='archived', updated_at=now()
  where id=p_workspace_id;
end;
$$;

revoke all on function public.archive_hive_preview_workspace(uuid)
  from public, anon;
grant execute on function public.archive_hive_preview_workspace(uuid)
  to authenticated;

commit;

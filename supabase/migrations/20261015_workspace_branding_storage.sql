-- Public branding assets with workspace-admin-only writes.

begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'workspace-assets',
  'workspace-assets',
  true,
  5242880,
  array['image/png','image/jpeg','image/webp']::text[]
)
on conflict(id) do update
set public=true,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.can_manage_workspace_asset(
  p_bucket_id text,
  p_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_workspace_id uuid;
begin
  if p_bucket_id <> 'workspace-assets' then return false; end if;
  if p_name !~ '^workspaces/[0-9a-fA-F-]{36}/branding/[^/]+$' then return false; end if;
  begin
    v_workspace_id:=split_part(p_name,'/',2)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return public.is_workspace_member(v_workspace_id,'admin');
end;
$$;

revoke all on function public.can_manage_workspace_asset(text,text) from public,anon;
grant execute on function public.can_manage_workspace_asset(text,text) to authenticated;

do $branding_storage$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "workspace admins manage branding assets" on storage.objects';
    execute 'create policy "workspace admins manage branding assets"
      on storage.objects
      for all
      to authenticated
      using (public.can_manage_workspace_asset(bucket_id,name))
      with check (public.can_manage_workspace_asset(bucket_id,name))';
  end if;
end;
$branding_storage$;

commit;

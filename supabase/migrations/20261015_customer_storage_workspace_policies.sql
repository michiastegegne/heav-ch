-- Workspace-safe storage policies for customer delivery files.

begin;

create or replace function public.can_manage_customer_storage_object(
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
  v_customer_id uuid;
  v_workspace_id uuid;
begin
  if p_bucket_id <> 'customer-deliveries' then
    return false;
  end if;

  if p_name !~ '^customers/[0-9a-fA-F-]{36}/[^/].+' then
    return false;
  end if;

  begin
    v_customer_id := split_part(p_name, '/', 2)::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  select customer.workspace_id
    into v_workspace_id
  from public.customers customer
  where customer.id = v_customer_id;

  if v_workspace_id is null then
    return false;
  end if;

  return public.is_workspace_member(v_workspace_id, 'member');
end;
$$;

revoke all on function public.can_manage_customer_storage_object(text, text) from public, anon;
grant execute on function public.can_manage_customer_storage_object(text, text) to authenticated;

-- Supabase Cloud provides storage.objects, while the lightweight migration
-- test database intentionally does not. Guard the Storage policies so the
-- database migration remains portable and testable.
do $hive_storage_policies$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "hive staff manages customer deliveries" on storage.objects';
    execute 'create policy "hive staff manages customer deliveries"
      on storage.objects
      for all
      to authenticated
      using (public.can_manage_customer_storage_object(bucket_id, name))
      with check (public.can_manage_customer_storage_object(bucket_id, name))';

    execute 'drop policy if exists "portal members download customer deliveries" on storage.objects';
    execute 'create policy "portal members download customer deliveries"
      on storage.objects
      for select
      to authenticated
      using (public.can_download_customer_storage_object(bucket_id, name))';
  end if;
end;
$hive_storage_policies$;

commit;

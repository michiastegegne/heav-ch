-- Workspace-aware offer actions for Hive.

begin;

create or replace function public.delete_workspace_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_workspace uuid;
  v_status text;
begin
  select workspace_id, status
    into v_workspace, v_status
  from public.offers
  where id = p_offer_id
  for update;

  if v_workspace is null then raise exception 'offer not found'; end if;
  if not public.is_workspace_member(v_workspace, 'accountant') then
    raise exception 'workspace accountant access required' using errcode = '42501';
  end if;
  if v_status <> 'draft' then
    raise exception 'only draft offers can be deleted';
  end if;

  delete from public.offers
  where id = p_offer_id and workspace_id = v_workspace;
end;
$$;

revoke all on function public.delete_workspace_offer(uuid) from public, anon;
grant execute on function public.delete_workspace_offer(uuid) to authenticated;

create or replace function public.share_workspace_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_offer public.offers%rowtype;
begin
  select * into v_offer
  from public.offers
  where id = p_offer_id
  for update;

  if v_offer.id is null then raise exception 'offer not found'; end if;
  if not public.is_workspace_member(v_offer.workspace_id, 'accountant') then
    raise exception 'workspace accountant access required' using errcode = '42501';
  end if;
  if v_offer.status in ('sent', 'accepted') then return; end if;
  if v_offer.status <> 'draft' then raise exception 'offer cannot be shared'; end if;

  -- "Shared" means visible in the customer portal. Actual outbound email is
  -- a separate action and can remain disabled in development.
  update public.offers
    set status = 'sent'
  where id = v_offer.id
    and workspace_id = v_offer.workspace_id;

  insert into public.offer_events(
    workspace_id, owner_id, offer_id, kind, actor_id
  )
  values (
    v_offer.workspace_id,
    v_offer.owner_id,
    v_offer.id,
    'shared',
    public.current_app_user_id()
  );
end;
$$;

revoke all on function public.share_workspace_offer(uuid) from public, anon;
grant execute on function public.share_workspace_offer(uuid) to authenticated;

create or replace function public.withdraw_workspace_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_offer public.offers%rowtype;
begin
  select * into v_offer
  from public.offers
  where id = p_offer_id
  for update;

  if v_offer.id is null then raise exception 'offer not found'; end if;
  if not public.is_workspace_member(v_offer.workspace_id, 'accountant') then
    raise exception 'workspace accountant access required' using errcode = '42501';
  end if;
  if v_offer.status not in ('draft', 'sent') then
    raise exception 'offer cannot be withdrawn';
  end if;

  update public.offers
    set status = 'withdrawn'
  where id = v_offer.id
    and workspace_id = v_offer.workspace_id;

  insert into public.offer_events(
    workspace_id, owner_id, offer_id, kind, actor_id,
    details
  )
  values (
    v_offer.workspace_id,
    v_offer.owner_id,
    v_offer.id,
    'withdrawn',
    public.current_app_user_id(),
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.withdraw_workspace_offer(uuid) from public, anon;
grant execute on function public.withdraw_workspace_offer(uuid) to authenticated;

commit;

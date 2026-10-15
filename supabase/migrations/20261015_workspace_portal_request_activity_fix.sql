-- Patch activity metadata for the workspace portal request workflow.
-- activity_events supports actor_type owner/customer/system and visibility owner/customer.

begin;

create or replace function public.process_workspace_portal_request(
  p_workspace_id uuid,
  p_request_id uuid,
  p_action text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.customer_portal_requests%rowtype;
  v_customer_id uuid;
  v_owner_id uuid;
begin
  if not public.is_workspace_member(p_workspace_id, 'admin') then
    raise exception 'workspace admin access required' using errcode='42501';
  end if;
  if p_action not in ('accept','decline') then
    raise exception 'invalid request action';
  end if;

  select * into v_request
  from public.customer_portal_requests
  where id=p_request_id
    and workspace_id=p_workspace_id
  for update;

  if v_request.id is null then raise exception 'request not found'; end if;
  if v_request.status <> 'pending' then raise exception 'request is not pending'; end if;

  if p_action='decline' then
    update public.customer_portal_requests
    set status='declined', reviewed_at=now()
    where id=v_request.id
      and workspace_id=p_workspace_id;
    return null;
  end if;

  select owner_id into v_owner_id
  from public.workspaces
  where id=p_workspace_id
    and status='active';

  if v_owner_id is null then raise exception 'workspace not found'; end if;

  select id into v_customer_id
  from public.customers
  where workspace_id=p_workspace_id
    and nullif(trim(email),'') is not null
    and lower(trim(email))=lower(trim(v_request.email))
  order by created_at
  limit 1;

  if v_customer_id is null then
    insert into public.customers(
      workspace_id, owner_id, company, contact_name, email, phone,
      address_line1, postal_code, city, country, notes
    )
    values(
      p_workspace_id,
      v_owner_id,
      nullif(trim(v_request.company),''),
      nullif(trim(v_request.contact_name),''),
      lower(trim(v_request.email)),
      coalesce(v_request.phone,''),
      '',
      '',
      '',
      'Schweiz',
      nullif(trim(v_request.message),'')
    )
    returning id into v_customer_id;
  end if;

  update public.customer_portal_requests
  set status='accepted',
      customer_id=v_customer_id,
      reviewed_at=now()
  where id=v_request.id
    and workspace_id=p_workspace_id;

  insert into public.activity_events(
    workspace_id, owner_id, customer_id, actor_id, actor_type,
    visibility, event_type, entity_type, entity_id, summary, metadata
  )
  values(
    p_workspace_id,
    v_owner_id,
    v_customer_id,
    public.current_app_user_id(),
    'owner',
    'owner',
    'portal_request_accepted',
    'customer',
    v_customer_id,
    'Portal-Anfrage als Kunde übernommen',
    jsonb_build_object('request_id',v_request.id)
  );

  return v_customer_id;
end;
$$;

revoke all on function public.process_workspace_portal_request(uuid,uuid,text)
  from public, anon;
grant execute on function public.process_workspace_portal_request(uuid,uuid,text)
  to authenticated;

commit;

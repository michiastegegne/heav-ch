-- Owner-only, atomic review decisions for public customer-portal requests.
create or replace function public.process_customer_portal_request(
  p_request_id uuid,
  p_action text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_request public.customer_portal_requests%rowtype;
  v_customer_id uuid;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if p_action not in ('accept', 'decline') then raise exception 'invalid request action'; end if;

  select * into v_request
  from public.customer_portal_requests
  where id = p_request_id and owner_id = v_owner
  for update;
  if v_request.id is null then raise exception 'request not found'; end if;
  if v_request.status <> 'pending' then raise exception 'request is not pending'; end if;

  if p_action = 'decline' then
    update public.customer_portal_requests
      set status = 'declined', reviewed_at = now()
      where id = v_request.id;
    return null;
  end if;

  insert into public.customers (
    owner_id, company, contact_name, email, phone, address_line1, postal_code, city, country
  ) values (
    v_owner, v_request.company, v_request.contact_name, v_request.email, v_request.phone, '', '', '', 'Schweiz'
  ) returning id into v_customer_id;

  update public.customer_portal_requests
    set status = 'accepted', customer_id = v_customer_id, reviewed_at = now()
    where id = v_request.id;
  return v_customer_id;
end;
$$;
revoke all on function public.process_customer_portal_request(uuid, text) from public, anon;
grant execute on function public.process_customer_portal_request(uuid, text) to authenticated;

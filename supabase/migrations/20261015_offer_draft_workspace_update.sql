-- Safe draft-only offer editing for Hive.

begin;

create or replace function public.update_workspace_offer_draft(
  p_offer_id uuid,
  p_customer_id uuid,
  p_project_id uuid,
  p_title text,
  p_issue_date date,
  p_valid_until date,
  p_tax_rate numeric,
  p_notes text,
  p_terms text,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_offer public.offers%rowtype;
  v_department_id uuid;
  v_subtotal bigint;
  v_tax bigint;
begin
  select * into v_offer
  from public.offers
  where id = p_offer_id
  for update;

  if v_offer.id is null then raise exception 'offer not found'; end if;
  if not public.is_workspace_member(v_offer.workspace_id, 'accountant') then
    raise exception 'workspace accountant access required' using errcode = '42501';
  end if;
  if v_offer.status <> 'draft' then raise exception 'only draft offers can be edited'; end if;
  if p_issue_date is null or p_valid_until is null or p_valid_until < p_issue_date then
    raise exception 'valid offer dates are required';
  end if;
  if length(trim(coalesce(p_title, ''))) < 2 then raise exception 'offer title is required'; end if;
  if length(trim(coalesce(p_terms, ''))) < 20 then raise exception 'offer terms are required'; end if;
  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 then raise exception 'invalid tax rate'; end if;

  if exists (
    select 1
    from public.offer_send_attempts
    where offer_id = p_offer_id
      and workspace_id = v_offer.workspace_id
      and state = 'pending'
  ) then
    raise exception 'offer send is in progress';
  end if;

  select department.id
    into v_department_id
  from public.customer_departments department
  where department.workspace_id = v_offer.workspace_id
    and department.customer_id = p_customer_id
    and department.is_default
    and department.active
  limit 1;

  if v_department_id is null then raise exception 'customer or default department not found'; end if;

  if p_project_id is not null and not exists (
    select 1 from public.projects project
    where project.id = p_project_id
      and project.workspace_id = v_offer.workspace_id
      and project.customer_id = p_customer_id
  ) then
    raise exception 'project not found or customer mismatch';
  end if;

  v_subtotal := public.validated_offer_subtotal(p_items);
  v_tax := round(v_subtotal * p_tax_rate / 100.0)::bigint;

  update public.offers
  set customer_id = p_customer_id,
      department_id = v_department_id,
      project_id = p_project_id,
      title = trim(p_title),
      issue_date = p_issue_date,
      valid_until = p_valid_until,
      notes = coalesce(p_notes, ''),
      terms = trim(p_terms),
      subtotal_rappen = v_subtotal,
      tax_rappen = v_tax,
      total_rappen = v_subtotal + v_tax,
      updated_at = now()
  where id = p_offer_id
    and workspace_id = v_offer.workspace_id;

  delete from public.offer_items
  where offer_id = p_offer_id
    and workspace_id = v_offer.workspace_id;

  insert into public.offer_items(
    workspace_id, owner_id, offer_id, position,
    description, quantity, unit_price_rappen
  )
  select
    v_offer.workspace_id,
    v_offer.owner_id,
    p_offer_id,
    ordinality::integer,
    trim(item->>'description'),
    (item->>'quantity')::numeric,
    (item->>'unit_price_rappen')::bigint
  from jsonb_array_elements(p_items) with ordinality as rows(item, ordinality);

  insert into public.offer_events(
    workspace_id, owner_id, offer_id, kind, actor_id, details
  )
  values (
    v_offer.workspace_id,
    v_offer.owner_id,
    p_offer_id,
    'updated',
    public.current_app_user_id(),
    '{"status":"draft"}'::jsonb
  );
end;
$$;

revoke all on function public.update_workspace_offer_draft(uuid, uuid, uuid, text, date, date, numeric, text, text, jsonb) from public, anon;
grant execute on function public.update_workspace_offer_draft(uuid, uuid, uuid, text, date, date, numeric, text, text, jsonb) to authenticated;

commit;

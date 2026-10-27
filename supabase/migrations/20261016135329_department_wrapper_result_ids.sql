-- Keep the created record ID available when assigning the department.
-- RETURN QUERY appends rows; it does not assign the output variables.
-- These wrappers remain available during the staged Hive migration, but must
-- never be able to attach a document to a department outside the selected
-- customer/workspace. The workspace-native Hive RPCs already authorize directly.

begin;

create or replace function public.create_invoice_in_department(
  p_customer_id uuid,
  p_project_id uuid,
  p_issue_date date,
  p_due_date date,
  p_tax_rate numeric,
  p_notes text,
  p_items jsonb,
  p_department_id uuid
)
returns table(invoice_id uuid, invoice_number text, payment_reference text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_workspace uuid;
  v_result record;
begin
  select customer.workspace_id
    into v_workspace
  from public.customers customer
  where customer.id = p_customer_id;

  if v_workspace is null then
    raise exception 'customer not found';
  end if;

  if not public.is_workspace_member(v_workspace, 'accountant') then
    raise exception 'workspace accountant access required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.customer_departments department
    where department.id = p_department_id
      and department.customer_id = p_customer_id
      and department.workspace_id = v_workspace
      and department.active
  ) then
    raise exception 'department workspace mismatch';
  end if;

  select * into strict v_result
    from public.create_invoice(
      p_customer_id,
      p_project_id,
      p_issue_date,
      p_due_date,
      p_tax_rate,
      p_notes,
      p_items
    );

  update public.invoices invoice
  set department_id = p_department_id
  where invoice.id = v_result.invoice_id
    and invoice.workspace_id = v_workspace;

  update public.activity_events event
  set department_id = p_department_id
  where event.entity_id = v_result.invoice_id
    and event.workspace_id = v_workspace
    and event.event_type = 'invoice.created';

  return query select v_result.invoice_id, v_result.invoice_number, v_result.payment_reference;
end;
$$;

revoke all on function public.create_invoice_in_department(
  uuid, uuid, date, date, numeric, text, jsonb, uuid
) from public, anon;
grant execute on function public.create_invoice_in_department(
  uuid, uuid, date, date, numeric, text, jsonb, uuid
) to authenticated;

create or replace function public.create_offer_in_department(
  p_customer_id uuid,
  p_project_id uuid,
  p_title text,
  p_issue_date date,
  p_valid_until date,
  p_tax_rate numeric,
  p_notes text,
  p_terms text,
  p_items jsonb,
  p_department_id uuid
)
returns table(offer_id uuid, offer_number text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_workspace uuid;
  v_result record;
begin
  select customer.workspace_id
    into v_workspace
  from public.customers customer
  where customer.id = p_customer_id;

  if v_workspace is null then
    raise exception 'customer not found';
  end if;

  if not public.is_workspace_member(v_workspace, 'accountant') then
    raise exception 'workspace accountant access required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.customer_departments department
    where department.id = p_department_id
      and department.customer_id = p_customer_id
      and department.workspace_id = v_workspace
      and department.active
  ) then
    raise exception 'department workspace mismatch';
  end if;

  select * into strict v_result
    from public.create_offer(
      p_customer_id,
      p_project_id,
      p_title,
      p_issue_date,
      p_valid_until,
      p_tax_rate,
      p_notes,
      p_terms,
      p_items
    );

  update public.offers offer
  set department_id = p_department_id
  where offer.id = v_result.offer_id
    and offer.workspace_id = v_workspace;

  update public.activity_events event
  set department_id = p_department_id
  where event.entity_id = v_result.offer_id
    and event.workspace_id = v_workspace
    and event.event_type = 'offer.created';

  return query select v_result.offer_id, v_result.offer_number;
end;
$$;

revoke all on function public.create_offer_in_department(
  uuid, uuid, text, date, date, numeric, text, text, jsonb, uuid
) from public, anon;
grant execute on function public.create_offer_in_department(
  uuid, uuid, text, date, date, numeric, text, text, jsonb, uuid
) to authenticated;

commit;

-- Safe draft-only invoice editing for Hive.

begin;

create or replace function public.update_workspace_invoice_draft(
  p_invoice_id uuid,
  p_customer_id uuid,
  p_project_id uuid,
  p_issue_date date,
  p_due_date date,
  p_tax_rate numeric,
  p_notes text,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_department_id uuid;
  v_customer_snapshot jsonb;
  v_project_title text;
  v_subtotal bigint;
  v_tax bigint;
begin
  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then raise exception 'invoice not found'; end if;
  if not public.is_workspace_member(v_invoice.workspace_id, 'accountant') then
    raise exception 'workspace accountant access required' using errcode = '42501';
  end if;
  if v_invoice.is_legacy then raise exception 'legacy invoice is immutable'; end if;
  if v_invoice.status <> 'draft' then raise exception 'only draft invoices can be edited'; end if;
  if p_issue_date is null or p_due_date is null or p_due_date < p_issue_date then
    raise exception 'valid invoice dates are required';
  end if;
  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 then
    raise exception 'invalid tax rate';
  end if;
  if exists (
    select 1 from public.invoice_send_attempts
    where invoice_id = p_invoice_id
      and workspace_id = v_invoice.workspace_id
      and state = 'pending'
  ) then
    raise exception 'invoice send is in progress';
  end if;

  select to_jsonb(customer), department.id
    into v_customer_snapshot, v_department_id
  from public.customers customer
  join public.customer_departments department
    on department.customer_id = customer.id
   and department.workspace_id = customer.workspace_id
   and department.is_default
   and department.active
  where customer.id = p_customer_id
    and customer.workspace_id = v_invoice.workspace_id
  limit 1;

  if v_customer_snapshot is null or v_department_id is null then
    raise exception 'customer or default department not found';
  end if;

  if p_project_id is not null then
    select nullif(trim(project.title), '')
      into v_project_title
    from public.projects project
    where project.id = p_project_id
      and project.workspace_id = v_invoice.workspace_id
      and project.customer_id = p_customer_id;
    if not found then raise exception 'project not found or customer mismatch'; end if;
  end if;

  v_subtotal := public.validated_invoice_subtotal(p_items);
  v_tax := round(v_subtotal * p_tax_rate / 100.0)::bigint;
  if v_subtotal + v_tax <= 0 then raise exception 'invoice total must be positive'; end if;

  update public.invoices
  set customer_id = p_customer_id,
      department_id = v_department_id,
      project_id = p_project_id,
      project_title_snapshot = v_project_title,
      customer_snapshot = v_customer_snapshot,
      issue_date = p_issue_date,
      due_date = p_due_date,
      tax_rate = p_tax_rate,
      subtotal_rappen = v_subtotal,
      tax_rappen = v_tax,
      total_rappen = v_subtotal + v_tax,
      notes = coalesce(p_notes, ''),
      updated_at = now()
  where id = p_invoice_id
    and workspace_id = v_invoice.workspace_id;

  delete from public.invoice_items
  where invoice_id = p_invoice_id
    and workspace_id = v_invoice.workspace_id;

  insert into public.invoice_items(
    workspace_id, owner_id, invoice_id, position,
    description, quantity, unit_price_rappen
  )
  select
    v_invoice.workspace_id,
    v_invoice.owner_id,
    p_invoice_id,
    ordinality::integer,
    trim(item->>'description'),
    (item->>'quantity')::numeric,
    (item->>'unit_price_rappen')::bigint
  from jsonb_array_elements(p_items) with ordinality as rows(item, ordinality);

  insert into public.invoice_events(
    workspace_id, owner_id, invoice_id, kind, details
  )
  values (
    v_invoice.workspace_id,
    v_invoice.owner_id,
    p_invoice_id,
    'updated',
    '{"status":"draft"}'::jsonb
  );
end;
$$;

revoke all on function public.update_workspace_invoice_draft(uuid, uuid, uuid, date, date, numeric, text, jsonb) from public, anon;
grant execute on function public.update_workspace_invoice_draft(uuid, uuid, uuid, date, date, numeric, text, jsonb) to authenticated;

commit;

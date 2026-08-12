-- Owner-controlled editing for customers, projects, and invoices.
-- Invoice numbers and ISO-11649 payment references remain server-assigned and immutable.

alter table public.invoice_events
  drop constraint invoice_events_kind_check;
alter table public.invoice_events
  add constraint invoice_events_kind_check check (
    kind in ('created', 'downloaded', 'sent', 'resent', 'paid', 'cancelled', 'send_failed', 'updated', 'status_changed')
  );

create or replace function public.update_customer(
  p_customer_id uuid,
  p_company text,
  p_contact_name text,
  p_email text,
  p_phone text,
  p_address_line1 text,
  p_postal_code text,
  p_city text,
  p_country text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if length(trim(coalesce(p_company, ''))) = 0 then raise exception 'company is required'; end if;
  if trim(coalesce(p_email, '')) !~* '^[^@]+@[^@]+\.[^@]+$' then raise exception 'valid email is required'; end if;
  if length(trim(coalesce(p_address_line1, ''))) = 0 or length(trim(coalesce(p_postal_code, ''))) = 0 or length(trim(coalesce(p_city, ''))) = 0 then
    raise exception 'address, postal code and city are required';
  end if;
  update public.customers set
    company = trim(p_company), contact_name = trim(coalesce(p_contact_name, '')),
    email = trim(p_email), phone = trim(coalesce(p_phone, '')),
    address_line1 = trim(p_address_line1), postal_code = trim(p_postal_code),
    city = trim(p_city), country = coalesce(nullif(trim(p_country), ''), 'Schweiz')
  where id = p_customer_id and owner_id = v_owner;
  if not found then raise exception 'customer not found'; end if;
end;
$$;
revoke all on function public.update_customer(uuid, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_customer(uuid, text, text, text, text, text, text, text, text) to authenticated;

create or replace function public.update_project(
  p_project_id uuid,
  p_customer_id uuid,
  p_title text,
  p_description text,
  p_status public.project_status,
  p_budget_rappen bigint,
  p_start_date date,
  p_due_date date
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'project title is required'; end if;
  if p_status is null or p_budget_rappen is null or p_budget_rappen < 0 then raise exception 'invalid project values'; end if;
  if p_due_date is not null and p_start_date is not null and p_due_date < p_start_date then raise exception 'due date must not precede start date'; end if;
  if not exists (select 1 from public.customers where id = p_customer_id and owner_id = v_owner) then raise exception 'customer not found'; end if;
  update public.projects set
    customer_id = p_customer_id, title = trim(p_title), description = trim(coalesce(p_description, '')),
    status = p_status, budget_rappen = p_budget_rappen, start_date = p_start_date, due_date = p_due_date
  where id = p_project_id and owner_id = v_owner;
  if not found then raise exception 'project not found'; end if;
end;
$$;
revoke all on function public.update_project(uuid, uuid, text, text, public.project_status, bigint, date, date) from public, anon;
grant execute on function public.update_project(uuid, uuid, text, text, public.project_status, bigint, date, date) to authenticated;

create or replace function public.update_invoice(
  p_invoice_id uuid,
  p_customer_id uuid,
  p_project_id uuid,
  p_issue_date date,
  p_due_date date,
  p_status public.invoice_status,
  p_tax_rate numeric,
  p_notes text,
  p_items jsonb
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_customer_snapshot jsonb;
  v_project_title text;
  v_subtotal bigint;
  v_tax bigint;
  v_item_count integer;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if p_issue_date is null or p_due_date is null or p_due_date < p_issue_date then raise exception 'valid invoice dates are required'; end if;
  if p_status is null or p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 then raise exception 'invalid invoice values'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'items must be an array'; end if;
  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 10 then raise exception 'one to ten items required'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) item where length(trim(coalesce(item->>'description', ''))) = 0 or coalesce((item->>'quantity')::numeric, 0) <= 0 or coalesce((item->>'unit_price_rappen')::bigint, -1) < 0) then
    raise exception 'invalid invoice item';
  end if;
  select to_jsonb(customer) into v_customer_snapshot from public.customers customer where customer.id = p_customer_id and customer.owner_id = v_owner;
  if v_customer_snapshot is null then raise exception 'customer not found'; end if;
  if p_project_id is not null then
    select nullif(trim(project.title), '') into v_project_title from public.projects project
      where project.id = p_project_id and project.customer_id = p_customer_id and project.owner_id = v_owner for key share;
    if not found then raise exception 'project not found or customer mismatch'; end if;
  end if;
  select coalesce(sum(round((item->>'quantity')::numeric * (item->>'unit_price_rappen')::bigint)), 0)::bigint into v_subtotal from jsonb_array_elements(p_items) item;
  v_tax := round(v_subtotal * p_tax_rate / 100.0)::bigint;
  if v_subtotal + v_tax <= 0 then raise exception 'invoice total must be positive'; end if;
  perform 1 from public.invoices where id = p_invoice_id and owner_id = v_owner and not is_legacy for update;
  if not found then raise exception 'invoice not found or immutable archive'; end if;
  if exists (select 1 from public.invoice_send_attempts where invoice_id = p_invoice_id and state = 'pending') then raise exception 'invoice send is in progress'; end if;

  update public.invoices set
    customer_id = p_customer_id, project_id = p_project_id, project_title_snapshot = v_project_title,
    customer_snapshot = v_customer_snapshot, issue_date = p_issue_date, due_date = p_due_date,
    status = p_status, tax_rate = p_tax_rate, subtotal_rappen = v_subtotal, tax_rappen = v_tax,
    total_rappen = v_subtotal + v_tax, notes = coalesce(p_notes, ''),
    sent_at = case when p_status = 'sent' then coalesce(sent_at, now()) else null end,
    paid_at = case when p_status = 'paid' then coalesce(paid_at, now()) else null end
  where id = p_invoice_id and owner_id = v_owner;
  delete from public.invoice_items where invoice_id = p_invoice_id and owner_id = v_owner;
  insert into public.invoice_items (owner_id, invoice_id, position, description, quantity, unit_price_rappen)
  select v_owner, p_invoice_id, ordinality::integer, trim(item->>'description'), (item->>'quantity')::numeric, (item->>'unit_price_rappen')::bigint
  from jsonb_array_elements(p_items) with ordinality as rows(item, ordinality);
  insert into public.invoice_events(owner_id, invoice_id, kind, details)
  values (v_owner, p_invoice_id, 'updated', jsonb_build_object('status', p_status));
end;
$$;
revoke all on function public.update_invoice(uuid, uuid, uuid, date, date, public.invoice_status, numeric, text, jsonb) from public, anon;
grant execute on function public.update_invoice(uuid, uuid, uuid, date, date, public.invoice_status, numeric, text, jsonb) to authenticated;

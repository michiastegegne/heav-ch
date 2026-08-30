-- Add first-class fixed/percentage discounts at the UI boundary while
-- keeping the persisted invoice line format stable for PDFs and exports.
-- Negative unit prices are reserved for quantity-1 discount rows.

alter table public.invoice_items
  drop constraint if exists invoice_items_unit_price_rappen_check;

alter table public.invoice_items
  drop constraint if exists invoice_items_discount_shape_check;

alter table public.invoice_items
  add constraint invoice_items_discount_shape_check
  check (unit_price_rappen >= 0 or quantity = 1);

create or replace function public.validated_invoice_subtotal(p_items jsonb)
returns bigint
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_quantity numeric;
  v_unit_price bigint;
  v_amount bigint;
  v_running bigint := 0;
  v_item_count integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be an array';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 10 then
    raise exception 'one to ten items required';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if length(trim(coalesce(v_item->>'description', ''))) = 0 then
      raise exception 'invalid invoice item';
    end if;

    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);
    v_unit_price := coalesce((v_item->>'unit_price_rappen')::bigint, 0);
    if v_quantity <= 0 then
      raise exception 'invalid invoice item';
    end if;

    if v_unit_price < 0 then
      if v_quantity <> 1 then
        raise exception 'discount quantity must equal one';
      end if;
      if v_running <= 0 then
        raise exception 'discount must follow a positive subtotal';
      end if;
      if v_running + v_unit_price <= 0 then
        raise exception 'discount must be smaller than preceding subtotal';
      end if;
      v_amount := v_unit_price;
    else
      v_amount := round(v_quantity * v_unit_price)::bigint;
    end if;

    v_running := v_running + v_amount;
  end loop;

  if v_running <= 0 then
    raise exception 'invoice total must be positive';
  end if;
  return v_running;
end;
$$;

revoke all on function public.validated_invoice_subtotal(jsonb) from public, anon, authenticated;

create or replace function public.create_invoice(
  p_customer_id uuid,
  p_project_id uuid,
  p_issue_date date,
  p_due_date date,
  p_tax_rate numeric,
  p_notes text,
  p_items jsonb
) returns table(invoice_id uuid, invoice_number text, payment_reference text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_invoice_id uuid;
  v_invoice_year integer;
  v_sequence bigint;
  v_invoice_number text;
  v_payment_reference text;
  v_customer_snapshot jsonb;
  v_issuer_snapshot jsonb;
  v_project_title text;
  v_subtotal bigint;
  v_tax bigint;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if p_issue_date is null or p_due_date is null then raise exception 'invoice dates are required'; end if;
  if not exists (select 1 from public.customers where id = p_customer_id and owner_id = v_owner) then
    raise exception 'customer not found';
  end if;
  select to_jsonb(customer) into v_customer_snapshot
  from public.customers customer where customer.id = p_customer_id and customer.owner_id = v_owner;
  select to_jsonb(settings) into v_issuer_snapshot
  from public.company_settings settings where settings.owner_id = v_owner;
  if v_issuer_snapshot is null then raise exception 'company settings are required'; end if;
  if p_project_id is not null then
    select nullif(trim(project.title), '') into v_project_title
    from public.projects project
    where project.id = p_project_id and project.owner_id = v_owner and project.customer_id = p_customer_id
    for key share;
    if not found then raise exception 'project not found or customer mismatch'; end if;
  end if;
  if p_due_date < p_issue_date then raise exception 'due date must not precede issue date'; end if;
  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 then raise exception 'invalid tax rate'; end if;
  if p_tax_rate > 0 and upper(trim(coalesce(v_issuer_snapshot->>'vat_number', ''))) !~ '^CHE-[0-9]{3}\.[0-9]{3}\.[0-9]{3} (MWST|TVA|IVA)$' then
    raise exception 'Für MWST ist eine gültige Schweizer MWST-Nummer erforderlich';
  end if;

  v_subtotal := public.validated_invoice_subtotal(p_items);
  v_tax := round(v_subtotal * p_tax_rate / 100.0)::bigint;
  if v_subtotal + v_tax <= 0 then raise exception 'invoice total must be positive'; end if;
  v_invoice_year := extract(year from p_issue_date)::integer;

  insert into public.invoice_number_counters(owner_id, invoice_year, last_value)
  values (v_owner, v_invoice_year, 1)
  on conflict (owner_id, invoice_year) do update
    set last_value = public.invoice_number_counters.last_value + 1
  returning last_value into v_sequence;

  if v_sequence > 9999999999999 then raise exception 'invoice sequence exhausted for SCOR reference'; end if;
  v_invoice_number := 'HEAV-' || v_invoice_year::text || '-' || lpad(v_sequence::text, greatest(3, length(v_sequence::text)), '0');
  v_payment_reference := public.make_creditor_reference(
    'HEAV' || v_invoice_year::text || lpad(v_sequence::text, greatest(6, length(v_sequence::text)), '0')
  );

  insert into public.invoices (
    owner_id, customer_id, project_id, project_title_snapshot, invoice_number, payment_reference, customer_snapshot, issuer_snapshot,
    issue_date, due_date, tax_rate, subtotal_rappen, tax_rappen, total_rappen, notes
  ) values (
    v_owner, p_customer_id, p_project_id, v_project_title, v_invoice_number, v_payment_reference, v_customer_snapshot, v_issuer_snapshot,
    p_issue_date, p_due_date, p_tax_rate, v_subtotal, v_tax, v_subtotal + v_tax, coalesce(p_notes, '')
  ) returning id into v_invoice_id;

  insert into public.invoice_items (owner_id, invoice_id, position, description, quantity, unit_price_rappen)
  select v_owner, v_invoice_id, ordinality::integer, trim(item->>'description'),
    (item->>'quantity')::numeric, (item->>'unit_price_rappen')::bigint
  from jsonb_array_elements(p_items) with ordinality as rows(item, ordinality);

  insert into public.invoice_events (owner_id, invoice_id, kind)
  values (v_owner, v_invoice_id, 'created');

  return query select v_invoice_id, v_invoice_number, v_payment_reference;
end;
$$;

revoke all on function public.create_invoice(uuid, uuid, date, date, numeric, text, jsonb) from public, anon;
grant execute on function public.create_invoice(uuid, uuid, date, date, numeric, text, jsonb) to authenticated;

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
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if p_issue_date is null or p_due_date is null or p_due_date < p_issue_date then raise exception 'valid invoice dates are required'; end if;
  if p_status is null or p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 then raise exception 'invalid invoice values'; end if;
  v_subtotal := public.validated_invoice_subtotal(p_items);
  select to_jsonb(customer) into v_customer_snapshot from public.customers customer where customer.id = p_customer_id and customer.owner_id = v_owner;
  if v_customer_snapshot is null then raise exception 'customer not found'; end if;
  if p_project_id is not null then
    select nullif(trim(project.title), '') into v_project_title from public.projects project
      where project.id = p_project_id and project.customer_id = p_customer_id and project.owner_id = v_owner for key share;
    if not found then raise exception 'project not found or customer mismatch'; end if;
  end if;
  v_tax := round(v_subtotal * p_tax_rate / 100.0)::bigint;
  if v_subtotal + v_tax <= 0 then raise exception 'invoice total must be positive'; end if;
  perform 1 from public.invoices where id = p_invoice_id and owner_id = v_owner for update;
  if not found then raise exception 'invoice not found'; end if;
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

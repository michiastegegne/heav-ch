-- Keep the project title as part of the immutable invoice record.
alter table public.invoices
  add column project_title_snapshot text;

-- Existing invoices cannot truthfully reconstruct a historical project title.
-- New invoices receive it atomically from the selected owner-scoped project.
drop function public.create_invoice(uuid, uuid, date, date, numeric, text, jsonb);

create function public.create_invoice(
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
  v_item_count integer;
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
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'items must be an array'; end if;
  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 10 then raise exception 'one to ten items required'; end if;
  if p_due_date < p_issue_date then raise exception 'due date must not precede issue date'; end if;
  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 then raise exception 'invalid tax rate'; end if;
  if p_tax_rate > 0 and upper(trim(coalesce(v_issuer_snapshot->>'vat_number', ''))) !~ '^CHE-[0-9]{3}\.[0-9]{3}\.[0-9]{3} (MWST|TVA|IVA)$' then
    raise exception 'Für MWST ist eine gültige Schweizer MWST-Nummer erforderlich';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item
    where length(trim(coalesce(item->>'description', ''))) = 0
      or coalesce((item->>'quantity')::numeric, 0) <= 0
      or coalesce((item->>'unit_price_rappen')::bigint, -1) < 0
  ) then raise exception 'invalid invoice item'; end if;

  select coalesce(sum(round((item->>'quantity')::numeric * (item->>'unit_price_rappen')::bigint)), 0)::bigint
  into v_subtotal from jsonb_array_elements(p_items) item;
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

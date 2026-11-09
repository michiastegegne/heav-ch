-- Adds a per-invoice-line display unit without changing any quantities, prices or historical documents.

-- NULL preserves legacy invoice display; new editors can select h, Stk. or Pauschale.

alter table public.invoice_items add column if not exists unit text;

do $constraint$ begin

  if not exists (select 1 from pg_constraint where conname='invoice_items_unit_allowed' and conrelid='public.invoice_items'::regclass) then

    alter table public.invoice_items add constraint invoice_items_unit_allowed check (unit is null or unit in ('h','Stk.','Pauschale'));

  end if;

end $constraint$;

-- Mark the two time-based services on Michel's already-drafted MT-2026-110 as hours.

update public.invoice_items set unit='h'

where invoice_id='b1d733e2-170b-4ef7-ab3b-9c3fb83172b9'::uuid and position in (1,2) and unit is distinct from 'h';

-- Preserve existing auth, validation and accounting rules for create_invoice
CREATE OR REPLACE FUNCTION public.create_invoice(p_customer_id uuid, p_project_id uuid, p_issue_date date, p_due_date date, p_tax_rate numeric, p_notes text, p_items jsonb)
 RETURNS TABLE(invoice_id uuid, invoice_number text, payment_reference text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_workspace uuid; v_owner uuid; v_settings public.workspace_settings%rowtype;
  v_invoice_id uuid; v_year integer; v_sequence bigint; v_number text; v_reference text;
  v_customer_snapshot jsonb; v_issuer_snapshot jsonb; v_subtotal bigint; v_tax bigint; v_count integer; v_prefix_body text;
begin
  if public.current_app_user_id() is null then raise exception 'authentication required'; end if;
  select customer.workspace_id into v_workspace from public.customers customer where customer.id = p_customer_id;
  if v_workspace is null or not public.is_workspace_member(v_workspace, 'accountant') then raise exception 'workspace access required'; end if;
  select * into v_settings from public.workspace_settings where workspace_id = v_workspace;
  select owner_id into v_owner from public.workspaces where id = v_workspace;
  if p_issue_date is null or p_due_date is null or p_due_date < p_issue_date then raise exception 'valid invoice dates are required'; end if;
  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 then raise exception 'invalid tax rate'; end if;
  if p_tax_rate > 0 and (not v_settings.vat_enabled or upper(trim(coalesce(v_settings.vat_number, ''))) !~ '^CHE-[0-9]{3}\.[0-9]{3}\.[0-9]{3} (MWST|TVA|IVA)$') then raise exception 'Für MWST ist eine gültige Schweizer MWST-Nummer erforderlich'; end if;
  if p_project_id is not null and not exists (select 1 from public.projects where id = p_project_id and workspace_id = v_workspace and customer_id = p_customer_id) then raise exception 'project not found or workspace mismatch'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'items must be an array'; end if;
  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 10 then raise exception 'one to ten items required'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) item where length(trim(coalesce(item->>'description', ''))) = 0 or coalesce((item->>'quantity')::numeric, 0) <= 0 or coalesce((item->>'unit_price_rappen')::bigint, -1) < 0) then raise exception 'invalid invoice item'; end if;
  select coalesce(sum(round((item->>'quantity')::numeric * (item->>'unit_price_rappen')::bigint)), 0)::bigint into v_subtotal from jsonb_array_elements(p_items) item;
  v_tax := round(v_subtotal * p_tax_rate / 100.0)::bigint;
  if v_subtotal + v_tax <= 0 then raise exception 'invoice total must be positive'; end if;
  v_year := extract(year from p_issue_date)::integer;
  insert into public.invoice_number_counters(workspace_id, owner_id, invoice_year, last_value)
  values (v_workspace, v_owner, v_year, 1)
  on conflict (workspace_id, invoice_year) do update set last_value = public.invoice_number_counters.last_value + 1
  returning last_value into v_sequence;
  v_number := v_settings.invoice_prefix || '-' || v_year::text || '-' || lpad(v_sequence::text, greatest(3, length(v_sequence::text)), '0');
  v_prefix_body := left(regexp_replace(v_settings.invoice_prefix, '[^A-Za-z0-9]', '', 'g'), 8);
  if v_prefix_body = '' then v_prefix_body := 'HIVE'; end if;
  v_reference := public.make_creditor_reference(left(v_prefix_body || v_year::text || lpad(v_sequence::text, greatest(6, length(v_sequence::text)), '0'), 21));
  select to_jsonb(customer) into v_customer_snapshot from public.customers customer where customer.id = p_customer_id;
  v_issuer_snapshot := to_jsonb(v_settings) || jsonb_build_object('company_name', v_settings.legal_name, 'owner_name', v_settings.contact_name, 'website_url', v_settings.website_url);
  insert into public.invoices(workspace_id, owner_id, customer_id, project_id, invoice_number, payment_reference, customer_snapshot, issuer_snapshot, issue_date, due_date, currency, tax_rate, subtotal_rappen, tax_rappen, total_rappen, notes)
  values (v_workspace, v_owner, p_customer_id, p_project_id, v_number, v_reference, v_customer_snapshot, v_issuer_snapshot, p_issue_date, p_due_date, v_settings.currency, p_tax_rate, v_subtotal, v_tax, v_subtotal + v_tax, coalesce(p_notes, ''))
  returning id into v_invoice_id;
  insert into public.invoice_items(workspace_id, owner_id, invoice_id, position, description, quantity, unit_price_rappen, unit)
  select v_workspace, v_owner, v_invoice_id, ordinality::integer, trim(item->>'description'), (item->>'quantity')::numeric, (item->>'unit_price_rappen')::bigint, nullif(trim(item->>'unit'), '') from jsonb_array_elements(p_items) with ordinality as rows(item, ordinality);
  insert into public.invoice_events(workspace_id, owner_id, invoice_id, kind) values (v_workspace, v_owner, v_invoice_id, 'created');
  return query select v_invoice_id, v_number, v_reference;
end;
$function$


-- Preserve existing auth, validation and accounting rules for create_workspace_invoice_draft
CREATE OR REPLACE FUNCTION public.create_workspace_invoice_draft(p_workspace_id uuid, p_customer_id uuid, p_project_id uuid, p_issue_date date, p_due_date date, p_tax_rate numeric, p_notes text, p_items jsonb)
 RETURNS TABLE(invoice_id uuid, invoice_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_owner uuid;
  v_settings public.workspace_settings%rowtype;
  v_invoice_id uuid := gen_random_uuid();
  v_department_id uuid;
  v_project_title text;
  v_customer_snapshot jsonb;
  v_issuer_snapshot jsonb;
  v_subtotal bigint;
  v_tax bigint;
  v_draft_number text;
begin
  if not public.is_workspace_member(p_workspace_id, 'accountant') then
    raise exception 'workspace accountant access required' using errcode='42501';
  end if;

  if p_issue_date is null or p_due_date is null or p_due_date < p_issue_date then
    raise exception 'valid invoice dates are required';
  end if;
  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 then
    raise exception 'invalid tax rate';
  end if;

  select workspace.owner_id into v_owner
  from public.workspaces workspace
  where workspace.id=p_workspace_id and workspace.status='active';
  if v_owner is null then raise exception 'workspace not found'; end if;

  select * into v_settings
  from public.workspace_settings
  where workspace_id=p_workspace_id;

  if p_tax_rate > 0 and (
    not v_settings.vat_enabled
    or upper(trim(coalesce(v_settings.vat_number,''))) !~ '^CHE-[0-9]{3}\.[0-9]{3}\.[0-9]{3} (MWST|TVA|IVA)$'
  ) then
    raise exception 'Für MWST ist eine gültige Schweizer MWST-Nummer erforderlich';
  end if;

  select to_jsonb(customer), department.id
    into v_customer_snapshot, v_department_id
  from public.customers customer
  join public.customer_departments department
    on department.customer_id=customer.id
   and department.workspace_id=customer.workspace_id
   and department.is_default
   and department.active
  where customer.id=p_customer_id
    and customer.workspace_id=p_workspace_id
  limit 1;
  if v_customer_snapshot is null or v_department_id is null then
    raise exception 'customer or default department not found';
  end if;

  if p_project_id is not null then
    select nullif(trim(project.title),'')
      into v_project_title
    from public.projects project
    where project.id=p_project_id
      and project.workspace_id=p_workspace_id
      and project.customer_id=p_customer_id;
    if not found then raise exception 'project not found or customer mismatch'; end if;
  end if;

  v_subtotal := public.validated_invoice_subtotal(p_items);
  v_tax := round(v_subtotal * p_tax_rate / 100.0)::bigint;
  if v_subtotal + v_tax <= 0 then raise exception 'invoice total must be positive'; end if;

  v_draft_number := 'DRAFT-' || upper(left(replace(v_invoice_id::text,'-',''),12));
  v_issuer_snapshot := to_jsonb(v_settings)
    || jsonb_build_object(
      'company_name',v_settings.legal_name,
      'owner_name',v_settings.contact_name,
      'website_url',v_settings.website_url
    );

  insert into public.invoices(
    id, workspace_id, owner_id, customer_id, department_id, project_id,
    invoice_number, payment_reference, customer_snapshot, issuer_snapshot,
    project_title_snapshot, issue_date, due_date, currency, tax_rate,
    subtotal_rappen, tax_rappen, total_rappen, notes, number_finalized
  )
  values(
    v_invoice_id,p_workspace_id,v_owner,p_customer_id,v_department_id,p_project_id,
    v_draft_number,null,v_customer_snapshot,v_issuer_snapshot,
    v_project_title,p_issue_date,p_due_date,v_settings.currency,p_tax_rate,
    v_subtotal,v_tax,v_subtotal+v_tax,coalesce(p_notes,''),false
  );

  insert into public.invoice_items(
    workspace_id,owner_id,invoice_id,position,description,quantity,unit_price_rappen, unit
  )
  select p_workspace_id,v_owner,v_invoice_id,ordinality::integer,
         trim(item->>'description'),(item->>'quantity')::numeric,
         (item->>'unit_price_rappen')::bigint, nullif(trim(item->>'unit'), '')
  from jsonb_array_elements(p_items) with ordinality as rows(item,ordinality);

  insert into public.invoice_events(workspace_id,owner_id,invoice_id,kind,details)
  values(p_workspace_id,v_owner,v_invoice_id,'created','{"number_finalized":false}'::jsonb);

  return query select v_invoice_id,v_draft_number;
end;
$function$


-- Preserve existing auth, validation and accounting rules for update_invoice
CREATE OR REPLACE FUNCTION public.update_invoice(p_invoice_id uuid, p_customer_id uuid, p_project_id uuid, p_issue_date date, p_due_date date, p_status invoice_status, p_tax_rate numeric, p_notes text, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_owner uuid := public.current_app_user_id();
  v_customer_snapshot jsonb;
  v_project_title text;
  v_subtotal bigint;
  v_tax bigint;
begin
  if not public.is_studio_owner() then
    raise exception 'Studio-Zugriff erforderlich' using errcode = '42501';
  end if;
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
  insert into public.invoice_items (owner_id, invoice_id, position, description, quantity, unit_price_rappen, unit)
  select v_owner, p_invoice_id, ordinality::integer, trim(item->>'description'), (item->>'quantity')::numeric, (item->>'unit_price_rappen')::bigint, nullif(trim(item->>'unit'), '')
  from jsonb_array_elements(p_items) with ordinality as rows(item, ordinality);
  insert into public.invoice_events(owner_id, invoice_id, kind, details)
  values (v_owner, p_invoice_id, 'updated', jsonb_build_object('status', p_status));
end;
$function$


-- Preserve existing auth, validation and accounting rules for update_workspace_invoice_draft
CREATE OR REPLACE FUNCTION public.update_workspace_invoice_draft(p_invoice_id uuid, p_customer_id uuid, p_project_id uuid, p_issue_date date, p_due_date date, p_tax_rate numeric, p_notes text, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_invoice public.invoices%rowtype;
  v_department_id uuid;
  v_customer_snapshot jsonb;
  v_project_title text;
  v_subtotal bigint;
  v_tax bigint;
begin
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'invoice not found'; end if;
  if not public.is_workspace_member(v_invoice.workspace_id,'accountant') then
    raise exception 'workspace accountant access required' using errcode='42501';
  end if;
  if v_invoice.is_legacy then raise exception 'legacy invoice is immutable'; end if;
  if v_invoice.status <> 'draft' then raise exception 'only draft invoices can be edited'; end if;
  if v_invoice.number_finalized then raise exception 'issued invoice is immutable'; end if;
  if p_issue_date is null or p_due_date is null or p_due_date < p_issue_date then
    raise exception 'valid invoice dates are required';
  end if;
  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 then raise exception 'invalid tax rate'; end if;
  if exists(
    select 1 from public.invoice_send_attempts
    where invoice_id=p_invoice_id and workspace_id=v_invoice.workspace_id and state='pending'
  ) then raise exception 'invoice send is in progress'; end if;

  select to_jsonb(customer),department.id into v_customer_snapshot,v_department_id
  from public.customers customer
  join public.customer_departments department
    on department.customer_id=customer.id
   and department.workspace_id=customer.workspace_id
   and department.is_default and department.active
  where customer.id=p_customer_id and customer.workspace_id=v_invoice.workspace_id
  limit 1;
  if v_customer_snapshot is null or v_department_id is null then raise exception 'customer or default department not found'; end if;

  if p_project_id is not null then
    select nullif(trim(project.title),'') into v_project_title
    from public.projects project
    where project.id=p_project_id
      and project.workspace_id=v_invoice.workspace_id
      and project.customer_id=p_customer_id;
    if not found then raise exception 'project not found or customer mismatch'; end if;
  end if;

  v_subtotal:=public.validated_invoice_subtotal(p_items);
  v_tax:=round(v_subtotal*p_tax_rate/100.0)::bigint;
  if v_subtotal+v_tax<=0 then raise exception 'invoice total must be positive'; end if;

  update public.invoices
  set customer_id=p_customer_id,department_id=v_department_id,project_id=p_project_id,
      project_title_snapshot=v_project_title,customer_snapshot=v_customer_snapshot,
      issue_date=p_issue_date,due_date=p_due_date,tax_rate=p_tax_rate,
      subtotal_rappen=v_subtotal,tax_rappen=v_tax,total_rappen=v_subtotal+v_tax,
      notes=coalesce(p_notes,''),updated_at=now()
  where id=p_invoice_id and workspace_id=v_invoice.workspace_id;

  delete from public.invoice_items where invoice_id=p_invoice_id and workspace_id=v_invoice.workspace_id;
  insert into public.invoice_items(workspace_id,owner_id,invoice_id,position,description,quantity,unit_price_rappen, unit)
  select v_invoice.workspace_id,v_invoice.owner_id,p_invoice_id,ordinality::integer,
         trim(item->>'description'),(item->>'quantity')::numeric,(item->>'unit_price_rappen')::bigint, nullif(trim(item->>'unit'), '')
  from jsonb_array_elements(p_items) with ordinality as rows(item,ordinality);

  insert into public.invoice_events(workspace_id,owner_id,invoice_id,kind,details)
  values(v_invoice.workspace_id,v_invoice.owner_id,p_invoice_id,'updated','{"status":"draft"}'::jsonb);
end;
$function$



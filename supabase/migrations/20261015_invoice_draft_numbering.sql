-- Draft invoice numbering: existing invoices stay finalized; new Hive drafts do not
-- consume a legal invoice number until explicitly issued.

begin;

alter table public.invoices
  add column if not exists number_finalized boolean not null default true;

create index if not exists invoices_workspace_finalized_idx
  on public.invoices(workspace_id, number_finalized, status, created_at);

create or replace function public.create_workspace_invoice_draft(
  p_workspace_id uuid,
  p_customer_id uuid,
  p_project_id uuid,
  p_issue_date date,
  p_due_date date,
  p_tax_rate numeric,
  p_notes text,
  p_items jsonb
)
returns table(invoice_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
    workspace_id,owner_id,invoice_id,position,description,quantity,unit_price_rappen
  )
  select p_workspace_id,v_owner,v_invoice_id,ordinality::integer,
         trim(item->>'description'),(item->>'quantity')::numeric,
         (item->>'unit_price_rappen')::bigint
  from jsonb_array_elements(p_items) with ordinality as rows(item,ordinality);

  insert into public.invoice_events(workspace_id,owner_id,invoice_id,kind,details)
  values(p_workspace_id,v_owner,v_invoice_id,'created','{"number_finalized":false}'::jsonb);

  return query select v_invoice_id,v_draft_number;
end;
$$;

revoke all on function public.create_workspace_invoice_draft(uuid,uuid,uuid,date,date,numeric,text,jsonb) from public,anon;
grant execute on function public.create_workspace_invoice_draft(uuid,uuid,uuid,date,date,numeric,text,jsonb) to authenticated;

create or replace function public.issue_workspace_invoice(p_invoice_id uuid)
returns table(invoice_number text,payment_reference text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_settings public.workspace_settings%rowtype;
  v_customer_snapshot jsonb;
  v_issuer_snapshot jsonb;
  v_project_title text;
  v_year integer;
  v_sequence bigint;
  v_number text;
  v_reference text;
  v_prefix_body text;
begin
  select * into v_invoice
  from public.invoices
  where id=p_invoice_id
  for update;

  if v_invoice.id is null then raise exception 'invoice not found'; end if;
  if not public.is_workspace_member(v_invoice.workspace_id,'accountant') then
    raise exception 'workspace accountant access required' using errcode='42501';
  end if;
  if v_invoice.is_legacy then raise exception 'legacy invoice is immutable'; end if;
  if v_invoice.status <> 'draft' then raise exception 'only draft invoices can be issued'; end if;

  if v_invoice.number_finalized then
    return query select v_invoice.invoice_number,v_invoice.payment_reference;
    return;
  end if;

  select * into v_settings
  from public.workspace_settings
  where workspace_id=v_invoice.workspace_id;

  if v_invoice.tax_rate > 0 and (
    not v_settings.vat_enabled
    or upper(trim(coalesce(v_settings.vat_number,''))) !~ '^CHE-[0-9]{3}\.[0-9]{3}\.[0-9]{3} (MWST|TVA|IVA)$'
  ) then
    raise exception 'Für MWST ist eine gültige Schweizer MWST-Nummer erforderlich';
  end if;

  select to_jsonb(customer)
    into v_customer_snapshot
  from public.customers customer
  where customer.id=v_invoice.customer_id
    and customer.workspace_id=v_invoice.workspace_id;
  if v_customer_snapshot is null then raise exception 'customer not found'; end if;

  if v_invoice.project_id is not null then
    select nullif(trim(project.title),'')
      into v_project_title
    from public.projects project
    where project.id=v_invoice.project_id
      and project.workspace_id=v_invoice.workspace_id;
  end if;

  v_year := extract(year from v_invoice.issue_date)::integer;
  insert into public.invoice_number_counters(workspace_id,owner_id,invoice_year,last_value)
  values(v_invoice.workspace_id,v_invoice.owner_id,v_year,1)
  on conflict(workspace_id,invoice_year)
  do update set last_value=public.invoice_number_counters.last_value+1
  returning last_value into v_sequence;

  v_number := v_settings.invoice_prefix || '-' || v_year::text || '-' ||
    lpad(v_sequence::text,greatest(3,length(v_sequence::text)),'0');
  v_prefix_body := left(regexp_replace(v_settings.invoice_prefix,'[^A-Za-z0-9]','','g'),8);
  if v_prefix_body='' then v_prefix_body:='HIVE'; end if;
  v_reference := public.make_creditor_reference(
    left(v_prefix_body || v_year::text || lpad(v_sequence::text,greatest(6,length(v_sequence::text)),'0'),21)
  );

  v_issuer_snapshot := to_jsonb(v_settings)
    || jsonb_build_object(
      'company_name',v_settings.legal_name,
      'owner_name',v_settings.contact_name,
      'website_url',v_settings.website_url
    );

  update public.invoices
  set invoice_number=v_number,
      payment_reference=v_reference,
      customer_snapshot=v_customer_snapshot,
      issuer_snapshot=v_issuer_snapshot,
      project_title_snapshot=v_project_title,
      number_finalized=true,
      updated_at=now()
  where id=v_invoice.id
    and workspace_id=v_invoice.workspace_id;

  insert into public.invoice_events(workspace_id,owner_id,invoice_id,kind,details)
  values(
    v_invoice.workspace_id,v_invoice.owner_id,v_invoice.id,'issued',
    jsonb_build_object('invoice_number',v_number,'payment_reference',v_reference)
  );

  return query select v_number,v_reference;
end;
$$;

revoke all on function public.issue_workspace_invoice(uuid) from public,anon;
grant execute on function public.issue_workspace_invoice(uuid) to authenticated;

create or replace function public.delete_workspace_invoice_draft(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice public.invoices%rowtype;
begin
  select * into v_invoice
  from public.invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'invoice not found'; end if;
  if not public.is_workspace_member(v_invoice.workspace_id,'accountant') then
    raise exception 'workspace accountant access required' using errcode='42501';
  end if;
  if v_invoice.is_legacy then raise exception 'legacy invoice is immutable'; end if;
  if v_invoice.status <> 'draft' or v_invoice.number_finalized then
    raise exception 'only unissued draft invoices can be deleted';
  end if;
  if exists(
    select 1 from public.invoice_send_attempts
    where invoice_id=p_invoice_id and workspace_id=v_invoice.workspace_id and state='pending'
  ) then raise exception 'invoice send is in progress'; end if;

  delete from public.invoices
  where id=p_invoice_id and workspace_id=v_invoice.workspace_id;
end;
$$;

revoke all on function public.delete_workspace_invoice_draft(uuid) from public,anon;
grant execute on function public.delete_workspace_invoice_draft(uuid) to authenticated;

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
  insert into public.invoice_items(workspace_id,owner_id,invoice_id,position,description,quantity,unit_price_rappen)
  select v_invoice.workspace_id,v_invoice.owner_id,p_invoice_id,ordinality::integer,
         trim(item->>'description'),(item->>'quantity')::numeric,(item->>'unit_price_rappen')::bigint
  from jsonb_array_elements(p_items) with ordinality as rows(item,ordinality);

  insert into public.invoice_events(workspace_id,owner_id,invoice_id,kind,details)
  values(v_invoice.workspace_id,v_invoice.owner_id,p_invoice_id,'updated','{"status":"draft"}'::jsonb);
end;
$$;

revoke all on function public.update_workspace_invoice_draft(uuid,uuid,uuid,date,date,numeric,text,jsonb) from public,anon;
grant execute on function public.update_workspace_invoice_draft(uuid,uuid,uuid,date,date,numeric,text,jsonb) to authenticated;

commit;

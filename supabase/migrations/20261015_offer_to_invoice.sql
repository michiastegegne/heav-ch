-- Convert an accepted offer into one traceable invoice draft.

begin;

alter table public.invoices
  add column if not exists source_offer_id uuid references public.offers(id) on delete set null;

create unique index if not exists invoices_workspace_source_offer_idx
  on public.invoices(workspace_id, source_offer_id)
  where source_offer_id is not null;

create or replace function public.convert_workspace_offer_to_invoice_draft(
  p_offer_id uuid,
  p_issue_date date default current_date,
  p_due_date date default null
)
returns table(invoice_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_offer public.offers%rowtype;
  v_due date;
  v_tax_rate numeric;
  v_items jsonb;
  v_created record;
begin
  select * into v_offer
  from public.offers
  where id=p_offer_id
  for update;

  if v_offer.id is null then raise exception 'offer not found'; end if;
  if not public.is_workspace_member(v_offer.workspace_id,'accountant') then
    raise exception 'workspace accountant access required' using errcode='42501';
  end if;
  if v_offer.status <> 'accepted' then
    raise exception 'only accepted offers can be converted';
  end if;

  if exists(
    select 1 from public.invoices invoice
    where invoice.workspace_id=v_offer.workspace_id
      and invoice.source_offer_id=v_offer.id
  ) then
    raise exception 'offer already converted';
  end if;

  if p_issue_date is null then raise exception 'issue date is required'; end if;
  v_due := coalesce(
    p_due_date,
    p_issue_date + coalesce(
      (select default_due_days from public.workspace_settings where workspace_id=v_offer.workspace_id),
      30
    )
  );
  if v_due < p_issue_date then raise exception 'valid invoice dates are required'; end if;

  v_tax_rate := case
    when v_offer.subtotal_rappen > 0
      then round((v_offer.tax_rappen::numeric / v_offer.subtotal_rappen::numeric) * 100, 2)
    else 0
  end;

  select jsonb_agg(
    jsonb_build_object(
      'description',item.description,
      'quantity',item.quantity,
      'unit_price_rappen',item.unit_price_rappen
    )
    order by item.position
  )
  into v_items
  from public.offer_items item
  where item.workspace_id=v_offer.workspace_id
    and item.offer_id=v_offer.id;

  if v_items is null or jsonb_array_length(v_items)=0 then
    raise exception 'offer has no items';
  end if;

  select * into v_created
  from public.create_workspace_invoice_draft(
    v_offer.workspace_id,
    v_offer.customer_id,
    v_offer.project_id,
    p_issue_date,
    v_due,
    v_tax_rate,
    concat('Erstellt aus Offerte ',v_offer.offer_number,'. ',coalesce(v_offer.notes,'')),
    v_items
  );

  update public.invoices
  set source_offer_id=v_offer.id
  where id=v_created.invoice_id
    and workspace_id=v_offer.workspace_id;

  insert into public.offer_events(
    workspace_id,owner_id,offer_id,kind,actor_id,details
  )
  values(
    v_offer.workspace_id,v_offer.owner_id,v_offer.id,'converted',
    public.current_app_user_id(),
    jsonb_build_object('invoice_id',v_created.invoice_id)
  );

  return query select v_created.invoice_id,v_created.invoice_number;
end;
$$;

revoke all on function public.convert_workspace_offer_to_invoice_draft(uuid,date,date) from public,anon;
grant execute on function public.convert_workspace_offer_to_invoice_draft(uuid,date,date) to authenticated;

alter table public.offer_events
  drop constraint if exists offer_events_kind_check;
alter table public.offer_events
  add constraint offer_events_kind_check
  check (kind = any (array[
    'created','updated','shared','emailed','accepted','withdrawn','converted'
  ]::text[]));

commit;

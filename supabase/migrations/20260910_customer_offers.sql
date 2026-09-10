-- HEAV offers: owner-authored, customer-visible proposals with a durable,
-- authenticated acceptance record. The portal acceptance is intentionally not
-- presented as a qualified electronic signature.

create table public.offer_number_counters (
  owner_id uuid not null references auth.users(id) on delete cascade,
  offer_year integer not null check (offer_year between 2000 and 9999),
  last_value bigint not null check (last_value >= 1),
  primary key (owner_id, offer_year)
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  offer_number text not null,
  title text not null check (length(trim(title)) between 2 and 160),
  issue_date date not null,
  valid_until date not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'expired', 'withdrawn')),
  notes text not null default '' check (length(notes) <= 8000),
  terms text not null default 'Mit der Annahme dieser Offerte bestätigst du verbindlich die aufgeführten Leistungen, Beträge und Bedingungen.' check (length(terms) between 20 and 8000),
  subtotal_rappen bigint not null check (subtotal_rappen > 0),
  tax_rappen bigint not null check (tax_rappen >= 0),
  total_rappen bigint not null check (total_rappen > 0),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, offer_number),
  check (valid_until >= issue_date),
  check ((status = 'accepted') = (accepted_at is not null and accepted_by is not null))
);

create table public.offer_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  position integer not null check (position between 1 and 10),
  description text not null check (length(trim(description)) between 1 and 1000),
  quantity numeric not null check (quantity > 0 and quantity <= 100000),
  unit_price_rappen bigint not null,
  unique (offer_id, position),
  check (unit_price_rappen >= 0 or quantity = 1)
);

create table public.offer_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  kind text not null check (kind in ('created', 'shared', 'accepted', 'withdrawn')),
  actor_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index offers_owner_status_idx on public.offers(owner_id, status, issue_date desc);
create index offers_customer_status_idx on public.offers(customer_id, status, valid_until desc);
create index offer_items_offer_idx on public.offer_items(offer_id, position);
create index offer_events_offer_idx on public.offer_events(offer_id, created_at desc);

create trigger offers_updated before update on public.offers
  for each row execute function public.set_updated_at();

create or replace function public.assert_offer_ownership()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_owner uuid;
  v_customer uuid;
begin
  if tg_table_name = 'offers' then
    select owner_id into v_owner from public.customers where id = new.customer_id;
    if v_owner is distinct from new.owner_id then raise exception 'offer customer owner mismatch'; end if;
    if new.project_id is not null then
      select owner_id, customer_id into v_owner, v_customer from public.projects where id = new.project_id;
      if v_owner is distinct from new.owner_id or v_customer is distinct from new.customer_id then
        raise exception 'offer project customer mismatch';
      end if;
    end if;
  elsif tg_table_name = 'offer_items' then
    select owner_id into v_owner from public.offers where id = new.offer_id;
    if v_owner is distinct from new.owner_id then raise exception 'offer item owner mismatch'; end if;
  elsif tg_table_name = 'offer_events' then
    select owner_id into v_owner from public.offers where id = new.offer_id;
    if v_owner is distinct from new.owner_id then raise exception 'offer event owner mismatch'; end if;
  end if;
  return new;
end;
$$;

create trigger offers_ownership before insert or update on public.offers
  for each row execute function public.assert_offer_ownership();
create trigger offer_items_ownership before insert or update on public.offer_items
  for each row execute function public.assert_offer_ownership();
create trigger offer_events_ownership before insert or update on public.offer_events
  for each row execute function public.assert_offer_ownership();

create or replace function public.validated_offer_subtotal(p_items jsonb)
returns bigint language plpgsql immutable set search_path = pg_catalog, public as $$
declare
  v_item jsonb;
  v_quantity numeric;
  v_unit_price bigint;
  v_amount bigint;
  v_running bigint := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 10 then
    raise exception 'one to ten offer items required';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if length(trim(coalesce(v_item->>'description', ''))) = 0 then raise exception 'invalid offer item'; end if;
    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);
    v_unit_price := coalesce((v_item->>'unit_price_rappen')::bigint, 0);
    if v_quantity <= 0 then raise exception 'invalid offer item'; end if;
    if v_unit_price < 0 then
      if v_quantity <> 1 or v_running + v_unit_price <= 0 then raise exception 'invalid offer discount'; end if;
      v_amount := v_unit_price;
    else
      v_amount := round(v_quantity * v_unit_price)::bigint;
    end if;
    v_running := v_running + v_amount;
  end loop;
  if v_running <= 0 then raise exception 'offer total must be positive'; end if;
  return v_running;
end;
$$;
revoke all on function public.validated_offer_subtotal(jsonb) from public, anon, authenticated;

create or replace function public.create_offer(
  p_customer_id uuid,
  p_project_id uuid,
  p_title text,
  p_issue_date date,
  p_valid_until date,
  p_tax_rate numeric,
  p_notes text,
  p_terms text,
  p_items jsonb
) returns table(offer_id uuid, offer_number text)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_owner uuid := auth.uid();
  v_offer_id uuid;
  v_year integer;
  v_sequence bigint;
  v_number text;
  v_subtotal bigint;
  v_tax bigint;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if p_issue_date is null or p_valid_until is null or p_valid_until < p_issue_date then raise exception 'valid offer dates are required'; end if;
  if length(trim(coalesce(p_title, ''))) < 2 then raise exception 'offer title is required'; end if;
  if length(trim(coalesce(p_terms, ''))) < 20 then raise exception 'offer terms are required'; end if;
  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 then raise exception 'invalid tax rate'; end if;
  if not exists (select 1 from public.customers where id = p_customer_id and owner_id = v_owner) then raise exception 'customer not found'; end if;
  if p_project_id is not null and not exists (select 1 from public.projects where id = p_project_id and customer_id = p_customer_id and owner_id = v_owner) then raise exception 'project not found or customer mismatch'; end if;
  v_subtotal := public.validated_offer_subtotal(p_items);
  v_tax := round(v_subtotal * p_tax_rate / 100.0)::bigint;
  v_year := extract(year from p_issue_date)::integer;
  insert into public.offer_number_counters(owner_id, offer_year, last_value)
  values (v_owner, v_year, 1)
  on conflict (owner_id, offer_year) do update set last_value = public.offer_number_counters.last_value + 1
  returning last_value into v_sequence;
  v_number := 'HEAV-O-' || v_year::text || '-' || lpad(v_sequence::text, greatest(3, length(v_sequence::text)), '0');
  insert into public.offers(owner_id, customer_id, project_id, offer_number, title, issue_date, valid_until, notes, terms, subtotal_rappen, tax_rappen, total_rappen)
  values (v_owner, p_customer_id, p_project_id, v_number, trim(p_title), p_issue_date, p_valid_until, coalesce(p_notes, ''), trim(p_terms), v_subtotal, v_tax, v_subtotal + v_tax)
  returning id into v_offer_id;
  insert into public.offer_items(owner_id, offer_id, position, description, quantity, unit_price_rappen)
  select v_owner, v_offer_id, ordinality::integer, trim(item->>'description'), (item->>'quantity')::numeric, (item->>'unit_price_rappen')::bigint
  from jsonb_array_elements(p_items) with ordinality as rows(item, ordinality);
  insert into public.offer_events(owner_id, offer_id, kind, actor_id) values (v_owner, v_offer_id, 'created', v_owner);
  return query select v_offer_id, v_number;
end;
$$;

create or replace function public.share_customer_offer(p_offer_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_owner uuid := auth.uid(); begin
  if v_owner is null then raise exception 'authentication required'; end if;
  update public.offers set status = 'sent' where id = p_offer_id and owner_id = v_owner and status = 'draft';
  if not found and not exists (select 1 from public.offers where id = p_offer_id and owner_id = v_owner and status in ('sent', 'accepted')) then raise exception 'offer cannot be shared'; end if;
  insert into public.offer_events(owner_id, offer_id, kind, actor_id) select owner_id, id, 'shared', v_owner from public.offers where id = p_offer_id and owner_id = v_owner;
end;
$$;

create or replace function public.accept_customer_offer(p_offer_id uuid)
returns timestamptz language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_user uuid := auth.uid();
  v_offer public.offers%rowtype;
  v_accepted_at timestamptz := now();
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_offer from public.offers where id = p_offer_id for update;
  if v_offer.id is null then raise exception 'offer not found'; end if;
  if not public.is_active_customer_member(v_offer.customer_id) then raise exception 'customer portal access required'; end if;
  if v_offer.status = 'accepted' then raise exception 'offer already accepted'; end if;
  if v_offer.status <> 'sent' then raise exception 'offer is not available for acceptance'; end if;
  if v_offer.valid_until < current_date then
    update public.offers set status = 'expired' where id = v_offer.id;
    raise exception 'offer has expired';
  end if;
  update public.offers set status = 'accepted', accepted_at = v_accepted_at, accepted_by = v_user where id = v_offer.id;
  insert into public.offer_events(owner_id, offer_id, kind, actor_id, details)
    values (v_offer.owner_id, v_offer.id, 'accepted', v_user, jsonb_build_object('accepted_at', v_accepted_at));
  return v_accepted_at;
end;
$$;

revoke all on function public.create_offer(uuid, uuid, text, date, date, numeric, text, text, jsonb) from public, anon;
revoke all on function public.share_customer_offer(uuid) from public, anon;
revoke all on function public.accept_customer_offer(uuid) from public, anon;
grant execute on function public.create_offer(uuid, uuid, text, date, date, numeric, text, text, jsonb) to authenticated;
grant execute on function public.share_customer_offer(uuid) to authenticated;
grant execute on function public.accept_customer_offer(uuid) to authenticated;

alter table public.offer_number_counters enable row level security;
alter table public.offers enable row level security;
alter table public.offer_items enable row level security;
alter table public.offer_events enable row level security;

create policy "owner manages offer counters" on public.offer_number_counters for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner manages offers" on public.offers for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "customer reads shared offers" on public.offers for select using (
  status in ('sent', 'accepted', 'expired') and public.is_active_customer_member(customer_id)
);
create policy "owner manages offer items" on public.offer_items for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "customer reads shared offer items" on public.offer_items for select using (
  exists (select 1 from public.offers offer where offer.id = offer_items.offer_id and offer.status in ('sent', 'accepted', 'expired') and public.is_active_customer_member(offer.customer_id))
);
create policy "owner reads offer events" on public.offer_events for select using (owner_id = auth.uid());

revoke all on public.offer_number_counters, public.offers, public.offer_items, public.offer_events from anon;
grant select, insert, update, delete on public.offer_number_counters, public.offers, public.offer_items, public.offer_events to authenticated;

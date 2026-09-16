-- Establish an explicit, server-seeded Studio authority boundary before adding
-- the AI assistant. Existing company-settings owners are backfilled once; after
-- this migration authenticated portal users cannot self-provision as owners.

begin;

create table public.studio_owners (
  user_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- The owner allowlist must be derived from the independently controlled Auth
-- identity, never from a tenant row an authenticated portal user could create.
lock table public.company_settings in share mode;

do $$
begin
  if (
    select count(*)
    from public.company_settings settings
    join auth.users users on users.id = settings.owner_id
    where lower(users.email) = 'admin@heav.ch'
  ) <> 1 then
    raise exception 'Expected exactly one trusted Studio owner identity' using errcode = '42501';
  end if;
end;
$$;

insert into public.studio_owners(user_id)
select settings.owner_id
from public.company_settings settings
join auth.users users on users.id = settings.owner_id
where lower(users.email) = 'admin@heav.ch'
on conflict (user_id) do nothing;

alter table public.studio_owners enable row level security;
revoke all on public.studio_owners from public, anon, authenticated;

create or replace function public.is_studio_owner()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.studio_owners owner where owner.user_id = auth.uid()
  );
$$;
revoke all on function public.is_studio_owner() from public, anon;
grant execute on function public.is_studio_owner() to authenticated;

-- SECURITY DEFINER routines bypass table RLS, so every owner-only business RPC
-- must enforce the immutable Studio authority boundary inside its own body. The
-- customer-facing acceptance RPC and membership/storage predicates are excluded.
do $$
declare
  v_name text;
  v_function record;
  v_guarded_source text;
begin
  foreach v_name in array array[
    'create_invoice', 'update_invoice', 'record_invoice_action',
    'reserve_invoice_send', 'complete_invoice_send', 'delete_draft_invoice',
    'delete_project', 'delete_customer', 'update_customer', 'update_project',
    'process_customer_portal_request', 'create_offer', 'share_customer_offer'
  ] loop
    for v_function in
      select procedure.oid, namespace.nspname, procedure.proname, procedure.prosrc,
             pg_get_function_arguments(procedure.oid) as arguments,
             pg_get_function_result(procedure.oid) as result
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = v_name
        and procedure.prosecdef
        and procedure.prolang = (select oid from pg_language where lanname = 'plpgsql')
    loop
      if position('public.is_studio_owner()' in v_function.prosrc) > 0 then
        continue;
      end if;
      v_guarded_source := regexp_replace(
        v_function.prosrc,
        E'\\mbegin\\M',
        E'begin\n  if not public.is_studio_owner() then\n    raise exception ''Studio-Zugriff erforderlich'' using errcode = ''42501'';\n  end if;',
        'i'
      );
      if v_guarded_source = v_function.prosrc then
        raise exception 'Unable to add Studio authority guard to %', v_name;
      end if;
      execute format(
        'create or replace function %I.%I(%s) returns %s language plpgsql security definer set search_path = pg_catalog, public as %L',
        v_function.nspname,
        v_function.proname,
        v_function.arguments,
        v_function.result,
        v_guarded_source
      );
    end loop;
  end loop;
end;
$$;

-- Gate every owner-facing base policy by the immutable Studio authority row.
drop policy if exists "owner manages customers" on public.customers;
create policy "owner manages customers" on public.customers for all
  using (owner_id = auth.uid() and public.is_studio_owner())
  with check (owner_id = auth.uid() and public.is_studio_owner());

drop policy if exists "owner manages projects" on public.projects;
create policy "owner manages projects" on public.projects for all
  using (owner_id = auth.uid() and public.is_studio_owner())
  with check (owner_id = auth.uid() and public.is_studio_owner());

drop policy if exists "owner manages invoices" on public.invoices;
create policy "owner manages invoices" on public.invoices for all
  using (owner_id = auth.uid() and public.is_studio_owner())
  with check (owner_id = auth.uid() and public.is_studio_owner());

drop policy if exists "owner manages invoice items" on public.invoice_items;
create policy "owner manages invoice items" on public.invoice_items for all
  using (owner_id = auth.uid() and public.is_studio_owner())
  with check (owner_id = auth.uid() and public.is_studio_owner());

drop policy if exists "owner manages settings" on public.company_settings;
create policy "owner manages settings" on public.company_settings for all
  using (owner_id = auth.uid() and public.is_studio_owner())
  with check (owner_id = auth.uid() and public.is_studio_owner());

drop policy if exists "owner reads invoice events" on public.invoice_events;
create policy "owner reads invoice events" on public.invoice_events for select
  using (owner_id = auth.uid() and public.is_studio_owner());

drop policy if exists "owner creates invoice events" on public.invoice_events;
create policy "owner creates invoice events" on public.invoice_events for insert
  with check (owner_id = auth.uid() and public.is_studio_owner());

-- Later portal/offer migrations are present in production but not every semantic
-- test harness. Replace those policies only when their tables exist.
do $$
begin
  if to_regclass('public.customer_portal_memberships') is not null then
    execute 'drop policy if exists "owner manages customer portal memberships" on public.customer_portal_memberships';
    execute 'create policy "owner manages customer portal memberships" on public.customer_portal_memberships for all using (owner_id = auth.uid() and public.is_studio_owner()) with check (owner_id = auth.uid() and public.is_studio_owner())';
  end if;
  if to_regclass('public.customer_files') is not null then
    execute 'drop policy if exists "owner manages customer files" on public.customer_files';
    execute 'create policy "owner manages customer files" on public.customer_files for all using (owner_id = auth.uid() and public.is_studio_owner()) with check (owner_id = auth.uid() and public.is_studio_owner())';
  end if;
  if to_regclass('public.customer_reviews') is not null then
    execute 'drop policy if exists "owner manages customer reviews" on public.customer_reviews';
    execute 'create policy "owner manages customer reviews" on public.customer_reviews for all using (public.is_studio_owner() and exists (select 1 from public.customers where customers.id = customer_reviews.customer_id and customers.owner_id = auth.uid())) with check (public.is_studio_owner() and exists (select 1 from public.customers where customers.id = customer_reviews.customer_id and customers.owner_id = auth.uid()))';
  end if;
  if to_regclass('public.customer_portal_invites') is not null then
    execute 'drop policy if exists "owner manages customer portal invites" on public.customer_portal_invites';
    execute 'create policy "owner manages customer portal invites" on public.customer_portal_invites for all using (owner_id = auth.uid() and public.is_studio_owner()) with check (owner_id = auth.uid() and public.is_studio_owner())';
  end if;
  if to_regclass('public.customer_portal_requests') is not null then
    execute 'drop policy if exists "owner manages customer portal requests" on public.customer_portal_requests';
    execute 'create policy "owner manages customer portal requests" on public.customer_portal_requests for all using (owner_id = auth.uid() and public.is_studio_owner()) with check (owner_id = auth.uid() and public.is_studio_owner())';
  end if;
  if to_regclass('public.offer_number_counters') is not null then
    execute 'drop policy if exists "owner manages offer counters" on public.offer_number_counters';
    execute 'create policy "owner manages offer counters" on public.offer_number_counters for all using (owner_id = auth.uid() and public.is_studio_owner()) with check (owner_id = auth.uid() and public.is_studio_owner())';
  end if;
  if to_regclass('public.offers') is not null then
    execute 'drop policy if exists "owner manages offers" on public.offers';
    execute 'create policy "owner manages offers" on public.offers for all using (owner_id = auth.uid() and public.is_studio_owner()) with check (owner_id = auth.uid() and public.is_studio_owner())';
  end if;
  if to_regclass('public.offer_items') is not null then
    execute 'drop policy if exists "owner manages offer items" on public.offer_items';
    execute 'create policy "owner manages offer items" on public.offer_items for all using (owner_id = auth.uid() and public.is_studio_owner()) with check (owner_id = auth.uid() and public.is_studio_owner())';
  end if;
  if to_regclass('public.offer_events') is not null then
    execute 'drop policy if exists "owner reads offer events" on public.offer_events';
    execute 'create policy "owner reads offer events" on public.offer_events for select using (owner_id = auth.uid() and public.is_studio_owner())';
  end if;
end;
$$;

create table public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.studio_owners(user_id) on delete cascade,
  title text not null default 'Neuer Chat' check (length(trim(title)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  owner_id uuid not null references public.studio_owners(user_id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(trim(content)) between 1 and 12000),
  proposals jsonb not null default '[]'::jsonb check (jsonb_typeof(proposals) = 'array'),
  created_at timestamptz not null default now()
);

create index assistant_threads_owner_updated_idx on public.assistant_threads(owner_id, updated_at desc);
create index assistant_messages_thread_created_idx on public.assistant_messages(thread_id, created_at);
create trigger assistant_threads_updated before update on public.assistant_threads
  for each row execute function public.set_updated_at();

create or replace function public.assert_assistant_message_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.assistant_threads where id = new.thread_id;
  if v_owner is null or v_owner is distinct from new.owner_id then
    raise exception 'thread owner mismatch';
  end if;
  return new;
end;
$$;
create trigger assistant_messages_owner before insert or update on public.assistant_messages
  for each row execute function public.assert_assistant_message_owner();

alter table public.assistant_threads enable row level security;
alter table public.assistant_messages enable row level security;

create policy "studio owner manages assistant threads" on public.assistant_threads for all
  using (owner_id = auth.uid() and public.is_studio_owner())
  with check (owner_id = auth.uid() and public.is_studio_owner());
create policy "studio owner reads assistant messages" on public.assistant_messages for select
  using (owner_id = auth.uid() and public.is_studio_owner());
create policy "studio owner creates assistant messages" on public.assistant_messages for insert
  with check (owner_id = auth.uid() and public.is_studio_owner());

revoke all on public.assistant_threads, public.assistant_messages from public, anon;
grant select, insert, update on public.assistant_threads to authenticated;
grant select, insert on public.assistant_messages to authenticated;

create table public.assistant_rate_limits (
  owner_id uuid primary key references public.studio_owners(user_id) on delete cascade,
  window_started timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);
create table public.assistant_request_leases (
  request_id uuid primary key,
  owner_id uuid not null references public.studio_owners(user_id) on delete cascade,
  created_at timestamptz not null default now()
);
create index assistant_request_leases_owner_created_idx on public.assistant_request_leases(owner_id, created_at);
alter table public.assistant_rate_limits enable row level security;
alter table public.assistant_request_leases enable row level security;
revoke all on public.assistant_rate_limits, public.assistant_request_leases from public, anon, authenticated;

create or replace function public.reserve_assistant_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_window timestamptz := date_trunc('minute', now());
  v_limit public.assistant_rate_limits%rowtype;
  v_active integer;
begin
  if not public.is_studio_owner() then
    raise exception 'Studio-Zugriff erforderlich' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'Request-Kennung erforderlich' using errcode = '22023';
  end if;

  insert into public.assistant_rate_limits(owner_id, window_started)
  values (v_owner, v_window)
  on conflict (owner_id) do nothing;

  select * into v_limit
  from public.assistant_rate_limits
  where owner_id = v_owner
  for update;

  delete from public.assistant_request_leases
  where owner_id = v_owner and created_at < now() - interval '2 minutes';

  if exists (select 1 from public.assistant_request_leases where request_id = p_request_id and owner_id = v_owner) then
    return true;
  end if;

  if v_limit.window_started <> v_window then
    v_limit.window_started := v_window;
    v_limit.request_count := 0;
  end if;

  select count(*)::integer into v_active
  from public.assistant_request_leases
  where owner_id = v_owner;

  if v_limit.request_count >= 10 or v_active >= 2 then
    update public.assistant_rate_limits
    set window_started = v_limit.window_started,
        request_count = v_limit.request_count,
        updated_at = now()
    where owner_id = v_owner;
    return false;
  end if;

  insert into public.assistant_request_leases(request_id, owner_id)
  values (p_request_id, v_owner);
  update public.assistant_rate_limits
  set window_started = v_limit.window_started,
      request_count = v_limit.request_count + 1,
      updated_at = now()
  where owner_id = v_owner;
  return true;
end;
$$;
revoke all on function public.reserve_assistant_request(uuid) from public, anon;
grant execute on function public.reserve_assistant_request(uuid) to authenticated;

create or replace function public.release_assistant_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_studio_owner() then
    raise exception 'Studio-Zugriff erforderlich' using errcode = '42501';
  end if;
  delete from public.assistant_request_leases
  where request_id = p_request_id and owner_id = auth.uid();
end;
$$;
revoke all on function public.release_assistant_request(uuid) from public, anon;
grant execute on function public.release_assistant_request(uuid) to authenticated;

create or replace function public.delete_assistant_thread(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_studio_owner() then
    raise exception 'Studio-Zugriff erforderlich' using errcode = '42501';
  end if;

  delete from public.assistant_threads
  where id = p_thread_id and owner_id = auth.uid();

  if not found then
    raise exception 'Chat nicht gefunden' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.delete_assistant_thread(uuid) from public, anon;
grant execute on function public.delete_assistant_thread(uuid) to authenticated;

commit;

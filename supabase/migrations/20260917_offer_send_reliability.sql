-- Durable offer-mail reservations keep provider retries idempotent.

create table public.offer_send_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  offer_id uuid not null references public.offers(id) on delete cascade,
  state text not null check (state in ('pending', 'sent', 'failed')),
  request_key uuid not null unique,
  idempotency_key text not null unique,
  provider_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index offer_send_attempts_one_pending_idx
  on public.offer_send_attempts(offer_id) where state = 'pending';

alter table public.offer_send_attempts enable row level security;
revoke all on public.offer_send_attempts from public, anon, authenticated;

create or replace function public.reserve_offer_send(p_offer_id uuid, p_request_key uuid)
returns table(attempt_id uuid, idempotency_key text, state text, provider_id text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_status text;
  v_valid_until date;
  v_attempt public.offer_send_attempts%rowtype;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if not public.is_studio_owner() then raise exception 'Studio-Zugriff erforderlich' using errcode = '42501'; end if;
  if p_offer_id is null or p_request_key is null then raise exception 'offer and request key are required'; end if;

  select status, valid_until into v_status, v_valid_until
  from public.offers
  where id = p_offer_id and owner_id = v_owner
  for update;
  if v_status is null then raise exception 'offer not found'; end if;
  if v_status <> 'sent' then raise exception 'offer must be shared before sending'; end if;
  if v_valid_until < current_date then raise exception 'offer has expired'; end if;

  select * into v_attempt
  from public.offer_send_attempts
  where offer_id = p_offer_id and owner_id = v_owner and request_key = p_request_key
  for update;
  if v_attempt.id is not null then
    if v_attempt.state = 'failed' then
      update public.offer_send_attempts
      set state = 'pending', created_at = now(), completed_at = null
      where id = v_attempt.id;
      v_attempt.state := 'pending';
    end if;
    return query select v_attempt.id, v_attempt.idempotency_key, v_attempt.state, v_attempt.provider_id;
    return;
  end if;

  select * into v_attempt
  from public.offer_send_attempts
  where offer_id = p_offer_id and owner_id = v_owner and public.offer_send_attempts.state = 'pending'
  order by created_at desc
  limit 1
  for update;
  if v_attempt.id is not null then
    return query select v_attempt.id, v_attempt.idempotency_key, v_attempt.state, v_attempt.provider_id;
    return;
  end if;

  v_attempt.id := gen_random_uuid();
  v_attempt.idempotency_key := 'offer-' || p_offer_id::text || '-' || p_request_key::text;
  insert into public.offer_send_attempts(id, owner_id, offer_id, state, request_key, idempotency_key)
  values (v_attempt.id, v_owner, p_offer_id, 'pending', p_request_key, v_attempt.idempotency_key);
  return query select v_attempt.id, v_attempt.idempotency_key, 'pending'::text, null::text;
end;
$$;
revoke all on function public.reserve_offer_send(uuid, uuid) from public, anon;
grant execute on function public.reserve_offer_send(uuid, uuid) to authenticated;

create or replace function public.complete_offer_send(
  p_attempt_id uuid,
  p_success boolean,
  p_provider_id text default null,
  p_recipient text default null,
  p_details jsonb default '{}'::jsonb
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := auth.uid();
  v_offer_id uuid;
  v_state text;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if not public.is_studio_owner() then raise exception 'Studio-Zugriff erforderlich' using errcode = '42501'; end if;
  if p_success is null then raise exception 'success flag is required'; end if;

  select offer_id, state into v_offer_id, v_state
  from public.offer_send_attempts
  where id = p_attempt_id and owner_id = v_owner
  for update;
  if v_offer_id is null then raise exception 'offer send attempt not found'; end if;
  if v_state = 'sent' then return 'sent'; end if;
  if v_state <> 'pending' then raise exception 'offer send attempt is already completed'; end if;

  if p_success then
    update public.offer_send_attempts
    set state = 'sent', provider_id = nullif(trim(coalesce(p_provider_id, '')), ''), completed_at = now()
    where id = p_attempt_id;
    insert into public.offer_events(owner_id, offer_id, kind, actor_id, details)
    values (
      v_owner,
      v_offer_id,
      'emailed',
      v_owner,
      jsonb_build_object('recipient', nullif(trim(coalesce(p_recipient, '')), ''), 'resend_id', nullif(trim(coalesce(p_provider_id, '')), '')) || coalesce(p_details, '{}'::jsonb)
    );
    return 'sent';
  end if;

  update public.offer_send_attempts
  set state = 'failed', completed_at = now()
  where id = p_attempt_id;
  return 'failed';
end;
$$;
revoke all on function public.complete_offer_send(uuid, boolean, text, text, jsonb) from public, anon;
grant execute on function public.complete_offer_send(uuid, boolean, text, text, jsonb) to authenticated;

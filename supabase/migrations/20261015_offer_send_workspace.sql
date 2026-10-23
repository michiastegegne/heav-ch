-- Workspace-aware offer send reservations and completion.

begin;

alter table public.offer_send_attempts
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

update public.offer_send_attempts attempt
set workspace_id = offer.workspace_id
from public.offers offer
where offer.id = attempt.offer_id
  and attempt.workspace_id is null;

alter table public.offer_send_attempts
  alter column workspace_id set not null;

create index if not exists offer_send_attempts_workspace_idx
  on public.offer_send_attempts(workspace_id, offer_id, state, created_at);

alter table public.offer_send_attempts enable row level security;

drop policy if exists "workspace accountants read offer send attempts" on public.offer_send_attempts;
create policy "workspace accountants read offer send attempts"
on public.offer_send_attempts
for select
to authenticated
using (public.is_workspace_member(workspace_id, 'accountant'));

create or replace function public.reserve_offer_send(
  p_offer_id uuid,
  p_request_key uuid
)
returns table(attempt_id uuid, idempotency_key text, state text, provider_id text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_offer public.offers%rowtype;
  v_attempt public.offer_send_attempts%rowtype;
begin
  if p_offer_id is null or p_request_key is null then
    raise exception 'offer and request key are required';
  end if;

  select * into v_offer
  from public.offers
  where id = p_offer_id
  for update;

  if v_offer.id is null then raise exception 'offer not found'; end if;
  if not public.is_workspace_member(v_offer.workspace_id, 'accountant') then
    raise exception 'workspace accountant access required' using errcode = '42501';
  end if;
  if v_offer.status <> 'sent' then raise exception 'offer must be shared before sending'; end if;
  if v_offer.valid_until < current_date then raise exception 'offer has expired'; end if;

  select * into v_attempt
  from public.offer_send_attempts
  where offer_id = p_offer_id
    and workspace_id = v_offer.workspace_id
    and request_key = p_request_key
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
  where offer_id = p_offer_id
    and workspace_id = v_offer.workspace_id
    and public.offer_send_attempts.state = 'pending'
  order by created_at desc
  limit 1
  for update;

  if v_attempt.id is not null then
    return query select v_attempt.id, v_attempt.idempotency_key, v_attempt.state, v_attempt.provider_id;
    return;
  end if;

  v_attempt.id := gen_random_uuid();
  v_attempt.idempotency_key := 'offer-' || p_offer_id::text || '-' || p_request_key::text;

  insert into public.offer_send_attempts(
    id, workspace_id, owner_id, offer_id, state, request_key, idempotency_key
  )
  values (
    v_attempt.id, v_offer.workspace_id, v_offer.owner_id, p_offer_id,
    'pending', p_request_key, v_attempt.idempotency_key
  );

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
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attempt public.offer_send_attempts%rowtype;
  v_offer public.offers%rowtype;
begin
  if p_success is null then raise exception 'success flag is required'; end if;

  select * into v_attempt
  from public.offer_send_attempts
  where id = p_attempt_id
  for update;

  if v_attempt.id is null then raise exception 'offer send attempt not found'; end if;
  if not public.is_workspace_member(v_attempt.workspace_id, 'accountant') then
    raise exception 'workspace accountant access required' using errcode = '42501';
  end if;
  if v_attempt.state = 'sent' then return 'sent'; end if;
  if v_attempt.state <> 'pending' then raise exception 'offer send attempt is already completed'; end if;

  select * into v_offer
  from public.offers
  where id = v_attempt.offer_id
    and workspace_id = v_attempt.workspace_id;

  if v_offer.id is null then raise exception 'offer not found'; end if;

  if p_success then
    update public.offer_send_attempts
    set state = 'sent',
        provider_id = nullif(trim(coalesce(p_provider_id, '')), ''),
        completed_at = now()
    where id = p_attempt_id;

    insert into public.offer_events(
      workspace_id, owner_id, offer_id, kind, actor_id, details
    )
    values (
      v_attempt.workspace_id,
      v_offer.owner_id,
      v_offer.id,
      'emailed',
      public.current_app_user_id(),
      jsonb_build_object(
        'recipient', nullif(trim(coalesce(p_recipient, '')), ''),
        'resend_id', nullif(trim(coalesce(p_provider_id, '')), '')
      ) || coalesce(p_details, '{}'::jsonb)
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

commit;

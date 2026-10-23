-- Hive: secure one-time linking from an existing Supabase Auth account
-- to a trusted third-party identity (Clerk).
--
-- This migration does NOT trust email matching. A legacy authenticated user
-- explicitly creates a short-lived one-time code. After signing in with Clerk,
-- that code can be redeemed once. The Clerk issuer must also be allowlisted.
--
-- Intentionally not seeded with any issuer. Production activation requires an
-- explicit reviewed INSERT into trusted_external_auth_issuers.

begin;

create table if not exists public.trusted_external_auth_issuers (
  issuer text primary key
    check (length(trim(issuer)) between 8 and 500),
  provider text not null default 'clerk'
    check (length(trim(provider)) between 2 and 40),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trusted_external_auth_issuers enable row level security;
revoke all on public.trusted_external_auth_issuers from public, anon, authenticated;

create table if not exists public.external_auth_identity_link_tokens (
  id uuid primary key default gen_random_uuid(),
  legacy_user_id uuid not null references auth.users(id) on delete restrict,
  token_hash text not null unique
    check (length(token_hash) = 64),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists external_auth_identity_link_tokens_user_idx
  on public.external_auth_identity_link_tokens(legacy_user_id, expires_at desc);

alter table public.external_auth_identity_link_tokens enable row level security;
revoke all on public.external_auth_identity_link_tokens from public, anon, authenticated;

create or replace function public.create_external_identity_link_token()
returns table(token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $hive_create_identity_link$
declare
  v_claims jsonb := auth.jwt();
  v_subject text := nullif(v_claims ->> 'sub', '');
  v_legacy uuid;
  v_token text;
  v_expires timestamptz := now() + interval '15 minutes';
begin
  if v_subject is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Only a real legacy Supabase Auth UUID subject may mint a migration code.
  -- A Clerk session (string subject) cannot manufacture a code for itself.
  begin
    v_legacy := v_subject::uuid;
  exception
    when invalid_text_representation then
      raise exception 'legacy Supabase session required' using errcode = '42501';
  end;

  if not exists (select 1 from auth.users where id = v_legacy) then
    raise exception 'legacy Supabase session required' using errcode = '42501';
  end if;

  -- Invalidate any older unused code for this account.
  update public.external_auth_identity_link_tokens
     set used_at = now()
   where legacy_user_id = v_legacy
     and used_at is null;

  v_token := 'hive_' || encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.external_auth_identity_link_tokens(
    legacy_user_id,
    token_hash,
    expires_at
  )
  values (
    v_legacy,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_expires
  );

  return query select v_token, v_expires;
end;
$hive_create_identity_link$;

revoke all on function public.create_external_identity_link_token() from public, anon;
grant execute on function public.create_external_identity_link_token() to authenticated;

create or replace function public.claim_external_identity_link_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $hive_claim_identity_link$
declare
  v_claims jsonb := auth.jwt();
  v_subject text := nullif(v_claims ->> 'sub', '');
  v_issuer text := nullif(v_claims ->> 'iss', '');
  v_provider text;
  v_legacy uuid;
  v_existing uuid;
begin
  if v_subject is null or v_issuer is null then
    raise exception 'third-party authentication required' using errcode = '42501';
  end if;

  select trusted.provider
    into v_provider
  from public.trusted_external_auth_issuers trusted
  where trusted.issuer = v_issuer
    and trusted.active
  limit 1;

  if v_provider is null then
    raise exception 'untrusted identity issuer' using errcode = '42501';
  end if;

  if p_token is null
     or length(p_token) <> 69
     or left(p_token, 5) <> 'hive_' then
    raise exception 'invalid or expired identity link code' using errcode = '22023';
  end if;

  select link.legacy_user_id
    into v_legacy
  from public.external_auth_identity_link_tokens link
  where link.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and link.used_at is null
    and link.expires_at > now()
  for update;

  if v_legacy is null then
    raise exception 'invalid or expired identity link code' using errcode = '22023';
  end if;

  select identity.legacy_user_id
    into v_existing
  from public.external_auth_identities identity
  where identity.issuer = v_issuer
    and identity.subject = v_subject
  limit 1;

  if v_existing is not null and v_existing <> v_legacy then
    raise exception 'identity is already linked to another account' using errcode = '23505';
  end if;

  insert into public.external_auth_identities(
    issuer,
    subject,
    legacy_user_id,
    provider,
    active
  )
  values (
    v_issuer,
    v_subject,
    v_legacy,
    v_provider,
    true
  )
  on conflict (issuer, subject)
  do update set
    active = true,
    provider = excluded.provider,
    updated_at = now();

  update public.external_auth_identity_link_tokens
     set used_at = now()
   where legacy_user_id = v_legacy
     and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and used_at is null;

  return v_legacy;
end;
$hive_claim_identity_link$;

revoke all on function public.claim_external_identity_link_token(text) from public, anon;
grant execute on function public.claim_external_identity_link_token(text) to authenticated;

commit;

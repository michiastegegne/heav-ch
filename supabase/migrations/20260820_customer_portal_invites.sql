-- Controlled enrollment for external HEAV customer accounts.
-- Public signup remains closed. A customer e-mail is allowed only after HEAV
-- created a short-lived invite record for that exact address.

create table public.customer_portal_invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email ~* '^[^@]+@[^@]+[.][^@]+$'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create unique index customer_portal_invites_open_email_idx
  on public.customer_portal_invites(customer_id, email)
  where revoked_at is null and accepted_at is null;
create index customer_portal_invites_owner_idx on public.customer_portal_invites(owner_id, created_at desc);

create table public.customer_portal_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  company text not null default '',
  contact_name text not null check (length(trim(contact_name)) between 2 and 160),
  email text not null check (email = lower(trim(email)) and email ~* '^[^@]+@[^@]+[.][^@]+$'),
  phone text not null default '',
  message text not null default '' check (length(message) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customer_portal_requests_pending_email_idx
  on public.customer_portal_requests(owner_id, email)
  where status = 'pending';
create index customer_portal_requests_owner_idx on public.customer_portal_requests(owner_id, status, created_at desc);
create trigger customer_portal_requests_updated before update on public.customer_portal_requests
  for each row execute function public.set_updated_at();

create or replace function public.assert_customer_portal_invite_ownership()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.customers where id = new.customer_id;
  if v_owner is distinct from new.owner_id then raise exception 'customer owner mismatch'; end if;
  return new;
end;
$$;
create trigger customer_portal_invites_ownership before insert or update on public.customer_portal_invites
  for each row execute function public.assert_customer_portal_invite_ownership();

alter table public.customer_portal_invites enable row level security;
alter table public.customer_portal_requests enable row level security;
create policy "owner manages customer portal invites" on public.customer_portal_invites
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner manages customer portal requests" on public.customer_portal_requests
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

revoke all on public.customer_portal_invites, public.customer_portal_requests from anon;
grant select, insert, update, delete on public.customer_portal_invites, public.customer_portal_requests to authenticated;

-- The hook runs before a password account is created. The client cannot write
-- invite rows, so it cannot self-authorize an arbitrary e-mail address.
create or replace function public.hook_restrict_heav_signup(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  signup_email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if signup_email = 'admin@heav.ch' or exists (
    select 1 from public.customer_portal_invites invite
    where invite.email = signup_email
      and invite.revoked_at is null
      and invite.accepted_at is null
      and invite.expires_at > now()
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Konten werden ausschliesslich über eine HEAV-Einladung erstellt.'
    )
  );
end;
$$;
revoke execute on function public.hook_restrict_heav_signup(jsonb) from public, anon, authenticated;
grant execute on function public.hook_restrict_heav_signup(jsonb) to supabase_auth_admin;

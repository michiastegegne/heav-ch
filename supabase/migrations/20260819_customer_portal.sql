-- HEAV Customer Portal: private, customer-scoped project delivery.
-- This migration deliberately keeps the existing owner CRM as the source of
-- truth. Customer accounts receive read access only through an active
-- membership; a guessed URL or storage path never grants access.

create table public.customer_portal_memberships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'client' check (role in ('client', 'customer_admin')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, user_id)
);

create table public.customer_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  original_filename text not null check (length(trim(original_filename)) > 0),
  storage_bucket text not null default 'customer-deliveries',
  storage_path text not null check (length(trim(storage_path)) > 0),
  kind text not null check (kind in ('image', 'video', 'gallery', 'offer', 'document')),
  bytes bigint check (bytes is null or bytes >= 0),
  mime_type text default '',
  download_enabled boolean not null default true,
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  check (expires_at is null or published_at is null or expires_at >= published_at)
);

create table public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  reviewer_name text not null check (length(trim(reviewer_name)) between 2 and 120),
  body text not null check (length(trim(body)) between 20 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'approved' and published_at is not null) or (status <> 'approved'))
);

create index customer_portal_memberships_user_idx on public.customer_portal_memberships(user_id, status);
create index customer_portal_memberships_customer_idx on public.customer_portal_memberships(customer_id, status);
create index customer_files_customer_idx on public.customer_files(customer_id, published_at desc);
create index customer_files_project_idx on public.customer_files(project_id, published_at desc);
create index customer_reviews_customer_idx on public.customer_reviews(customer_id, created_at desc);

create trigger customer_portal_memberships_updated before update on public.customer_portal_memberships
  for each row execute function public.set_updated_at();
create trigger customer_files_updated before update on public.customer_files
  for each row execute function public.set_updated_at();
create trigger customer_reviews_updated before update on public.customer_reviews
  for each row execute function public.set_updated_at();

-- Cross-owner foreign keys are rejected even if a UUID is known.
create or replace function public.assert_customer_portal_ownership()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_customer_owner uuid;
  v_project_customer uuid;
  v_project_owner uuid;
begin
  select owner_id into v_customer_owner from public.customers where id = new.customer_id;
  if v_customer_owner is null then
    raise exception 'customer not found';
  end if;

  if tg_table_name = 'customer_portal_memberships' then
    if v_customer_owner <> new.owner_id then
      raise exception 'customer owner mismatch';
    end if;
  elsif tg_table_name = 'customer_files' then
    if v_customer_owner <> new.owner_id then
      raise exception 'customer owner mismatch';
    end if;
    if new.project_id is not null then
      select customer_id, owner_id into v_project_customer, v_project_owner from public.projects where id = new.project_id;
      if v_project_owner is distinct from new.owner_id or v_project_customer is distinct from new.customer_id then
        raise exception 'project customer mismatch';
      end if;
    end if;
  elsif tg_table_name = 'customer_reviews' then
    if not exists (
      select 1 from public.customer_portal_memberships
      where customer_id = new.customer_id and user_id = new.author_id and status = 'active'
    ) then
      raise exception 'review author has no active membership';
    end if;
  end if;
  return new;
end;
$$;

create trigger customer_portal_memberships_ownership before insert or update on public.customer_portal_memberships
  for each row execute function public.assert_customer_portal_ownership();
create trigger customer_files_ownership before insert or update on public.customer_files
  for each row execute function public.assert_customer_portal_ownership();
create trigger customer_reviews_membership before insert or update on public.customer_reviews
  for each row execute function public.assert_customer_portal_ownership();

-- A narrow server-side membership predicate is used by every customer-facing
-- policy. It bypasses RLS on the membership table but never accepts a caller
-- supplied user id.
create or replace function public.is_active_customer_member(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.customer_portal_memberships membership
    where membership.customer_id = p_customer_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  );
$$;
revoke all on function public.is_active_customer_member(uuid) from public, anon;
grant execute on function public.is_active_customer_member(uuid) to authenticated;

alter table public.customer_portal_memberships enable row level security;
alter table public.customer_files enable row level security;
alter table public.customer_reviews enable row level security;

create policy "owner manages customer portal memberships" on public.customer_portal_memberships
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "member reads own portal membership" on public.customer_portal_memberships
  for select using (user_id = auth.uid() and status = 'active');

create policy "owner manages customer files" on public.customer_files
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "member reads published customer files" on public.customer_files
  for select using (
    published_at is not null
    and (expires_at is null or expires_at > now())
    and public.is_active_customer_member(customer_id)
  );

create policy "owner manages customer reviews" on public.customer_reviews
  for all using (
    exists (select 1 from public.customers where customers.id = customer_reviews.customer_id and customers.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.customers where customers.id = customer_reviews.customer_id and customers.owner_id = auth.uid())
  );
create policy "member reads own customer reviews" on public.customer_reviews
  for select using (author_id = auth.uid() and public.is_active_customer_member(customer_id));
create policy "member submits pending customer review" on public.customer_reviews
  for insert with check (
    author_id = auth.uid()
    and status = 'pending'
    and published_at is null
    and public.is_active_customer_member(customer_id)
  );

-- Existing business records stay owner-managed. Clients can only read their
-- own delivered project and issued invoice records; drafts and invoice events
-- remain private to HEAV.
create policy "member reads own projects" on public.projects
  for select using (public.is_active_customer_member(customer_id));
create policy "member reads own issued invoices" on public.invoices
  for select using (
    status in ('sent', 'paid', 'overdue')
    and public.is_active_customer_member(customer_id)
  );
create policy "member reads own issued invoice items" on public.invoice_items
  for select using (
    exists (
      select 1 from public.invoices invoice
      where invoice.id = invoice_items.invoice_id
        and invoice.status in ('sent', 'paid', 'overdue')
        and public.is_active_customer_member(invoice.customer_id)
    )
  );

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.customer_portal_memberships, public.customer_files, public.customer_reviews to authenticated;

-- Supabase Storage remains private. A client receives object access only when a
-- published customer-file record points to that exact bucket/key pair.
create or replace function public.can_download_customer_storage_object(p_bucket_id text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.customer_files file
    where file.storage_bucket = p_bucket_id
      and file.storage_path = p_name
      and file.published_at is not null
      and (file.expires_at is null or file.expires_at > now())
      and file.download_enabled
      and public.is_active_customer_member(file.customer_id)
  );
$$;
revoke all on function public.can_download_customer_storage_object(text, text) from public, anon;
grant execute on function public.can_download_customer_storage_object(text, text) to authenticated;

alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select on storage.objects to authenticated;
create policy "member downloads only assigned customer delivery files" on storage.objects
  for select to authenticated using (
    public.can_download_customer_storage_object(bucket_id, name)
  );

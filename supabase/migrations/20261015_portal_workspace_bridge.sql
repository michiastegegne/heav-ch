-- Make customer portal policies compatible with the Clerk identity bridge
-- while preserving legacy Supabase Auth UUID sessions.

begin;

create or replace function public.is_active_customer_member(
  p_customer_id uuid,
  p_department_id uuid
)
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
      and membership.department_id = p_department_id
      and membership.user_id = public.current_app_user_id()
      and membership.status = 'active'
  );
$$;

revoke all on function public.is_active_customer_member(uuid, uuid) from public, anon;
grant execute on function public.is_active_customer_member(uuid, uuid) to authenticated;

drop policy if exists "member reads own portal membership" on public.customer_portal_memberships;
create policy "member reads own portal membership"
on public.customer_portal_memberships
for select
to authenticated
using (
  user_id = public.current_app_user_id()
  and status = 'active'
);

drop policy if exists "owner manages customer portal memberships" on public.customer_portal_memberships;
drop policy if exists "workspace admins manage customer portal memberships" on public.customer_portal_memberships;
create policy "workspace admins manage customer portal memberships"
on public.customer_portal_memberships
for all
to authenticated
using (public.is_workspace_member(workspace_id, 'admin'))
with check (public.is_workspace_member(workspace_id, 'admin'));

drop policy if exists "owner manages customer portal invites" on public.customer_portal_invites;
drop policy if exists "workspace admins manage customer portal invites" on public.customer_portal_invites;
create policy "workspace admins manage customer portal invites"
on public.customer_portal_invites
for all
to authenticated
using (public.is_workspace_member(workspace_id, 'admin'))
with check (public.is_workspace_member(workspace_id, 'admin'));

drop policy if exists "owner manages customer portal requests" on public.customer_portal_requests;
drop policy if exists "workspace admins manage customer portal requests" on public.customer_portal_requests;
create policy "workspace admins manage customer portal requests"
on public.customer_portal_requests
for all
to authenticated
using (public.is_workspace_member(workspace_id, 'admin'))
with check (public.is_workspace_member(workspace_id, 'admin'));

drop policy if exists "owner manages customer files" on public.customer_files;
drop policy if exists "workspace members manage customer files" on public.customer_files;
create policy "workspace members manage customer files"
on public.customer_files
for all
to authenticated
using (public.is_workspace_member(workspace_id, 'member'))
with check (public.is_workspace_member(workspace_id, 'member'));

drop policy if exists "member reads own department reviews" on public.customer_reviews;
create policy "member reads own department reviews"
on public.customer_reviews
for select
to authenticated
using (
  author_id = public.current_app_user_id()
  and public.is_active_customer_member(customer_id, department_id)
);

drop policy if exists "member submits pending department review" on public.customer_reviews;
create policy "member submits pending department review"
on public.customer_reviews
for insert
to authenticated
with check (
  author_id = public.current_app_user_id()
  and status = 'pending'
  and published_at is null
  and public.is_active_customer_member(customer_id, department_id)
);

drop policy if exists "owner manages customer reviews" on public.customer_reviews;
drop policy if exists "workspace admins manage customer reviews" on public.customer_reviews;
create policy "workspace admins manage customer reviews"
on public.customer_reviews
for all
to authenticated
using (public.is_workspace_member(workspace_id, 'admin'))
with check (public.is_workspace_member(workspace_id, 'admin'));

drop policy if exists "owner reads activity events" on public.activity_events;
drop policy if exists "workspace members read activity events" on public.activity_events;
create policy "workspace members read activity events"
on public.activity_events
for select
to authenticated
using (workspace_id is not null and public.is_workspace_member(workspace_id, 'member'));

commit;

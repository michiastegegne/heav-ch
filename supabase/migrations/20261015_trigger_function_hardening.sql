-- Trigger helper functions must never be callable directly through PostgREST.
-- Revoking EXECUTE does not prevent already-created database triggers from firing.

begin;

revoke all on function public.assert_assistant_message_owner() from public, anon, authenticated;
revoke all on function public.assert_customer_portal_invite_ownership() from public, anon, authenticated;
revoke all on function public.assert_customer_portal_ownership() from public, anon, authenticated;
revoke all on function public.assert_department_scope() from public, anon, authenticated;
revoke all on function public.assert_offer_ownership() from public, anon, authenticated;
revoke all on function public.assert_workspace_scope() from public, anon, authenticated;
revoke all on function public.assign_default_department() from public, anon, authenticated;
revoke all on function public.assign_workspace_context() from public, anon, authenticated;
revoke all on function public.ensure_default_customer_department() from public, anon, authenticated;
revoke all on function public.log_activity_row() from public, anon, authenticated;

commit;

-- Use the existing invoice_events vocabulary for automatic overdue changes.

begin;

create or replace function public.refresh_overdue_invoices(
  p_run_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
begin
  with changed as (
    update public.invoices invoice
    set status='overdue',
        updated_at=now()
    where invoice.status='sent'
      and invoice.due_date < p_run_date
      and invoice.is_legacy=false
    returning invoice.id,invoice.workspace_id,invoice.owner_id
  ),
  logged as (
    insert into public.invoice_events(
      workspace_id,owner_id,invoice_id,kind,details
    )
    select
      changed.workspace_id,
      changed.owner_id,
      changed.id,
      'updated',
      jsonb_build_object('status','overdue','run_date',p_run_date)
    from changed
    returning 1
  )
  select count(*)::integer into v_count from logged;

  return v_count;
end;
$$;

revoke all on function public.refresh_overdue_invoices(date)
  from public, anon, authenticated;
grant execute on function public.refresh_overdue_invoices(date)
  to service_role;

commit;

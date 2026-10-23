-- Keep invoice/offer department scope aligned with their selected project.
-- Runs after workspace normalization and before department-scope validation.

begin;

create or replace function public.sync_document_project_department()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_department_id uuid;
begin
  if (to_jsonb(new)->>'project_id') is null then
    return new;
  end if;

  select project.department_id
    into v_department_id
  from public.projects project
  where project.id = (to_jsonb(new)->>'project_id')::uuid
    and project.workspace_id = new.workspace_id
    and project.customer_id = new.customer_id
    and project.owner_id = new.owner_id;

  if v_department_id is null then
    raise exception 'project not found or document scope mismatch';
  end if;

  new.department_id := v_department_id;
  return new;
end;
$$;

revoke all on function public.sync_document_project_department() from public, anon, authenticated;

drop trigger if exists c_invoices_project_department on public.invoices;
create trigger c_invoices_project_department
before insert or update on public.invoices
for each row execute function public.sync_document_project_department();

drop trigger if exists c_offers_project_department on public.offers;
create trigger c_offers_project_department
before insert or update on public.offers
for each row execute function public.sync_document_project_department();

commit;

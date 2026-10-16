-- Immutable persisted PDF snapshots for issued Hive invoices.
--
-- The invoice row remains the legal/business record. This table records the
-- exact binary document that was first generated from that immutable issued
-- snapshot so later downloads and email attachments can reuse the same bytes.

begin;

create table if not exists public.invoice_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  storage_bucket text not null default 'invoice-documents'
    check (storage_bucket = 'invoice-documents'),
  storage_path text not null
    check (storage_path ~ '^[0-9a-fA-F-]{36}/invoices/[0-9a-fA-F-]{36}/v[0-9]+[.]pdf$'),
  filename text not null check (length(trim(filename)) between 1 and 180),
  content_type text not null default 'application/pdf'
    check (content_type = 'application/pdf'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes bigint not null check (bytes > 0 and bytes <= 52428800),
  created_at timestamptz not null default now(),
  unique(invoice_id, version),
  unique(storage_bucket, storage_path)
);

create index if not exists invoice_documents_workspace_idx
  on public.invoice_documents(workspace_id, created_at desc);

alter table public.invoice_documents enable row level security;

revoke all on public.invoice_documents from public, anon, authenticated;
grant select on public.invoice_documents to authenticated;

drop policy if exists "workspace accountants read invoice documents"
  on public.invoice_documents;
create policy "workspace accountants read invoice documents"
on public.invoice_documents
for select
to authenticated
using (public.is_workspace_member(workspace_id, 'accountant'));

-- Customer-portal invoice visibility remains enforced by the invoices RLS
-- policy. Metadata can be read only when the caller can also see the matching
-- issued invoice inside the same workspace/department boundary.
drop policy if exists "portal members read invoice document metadata"
  on public.invoice_documents;
create policy "portal members read invoice document metadata"
on public.invoice_documents
for select
to authenticated
using (
  exists (
    select 1
    from public.invoices invoice
    where invoice.id = invoice_documents.invoice_id
      and invoice.workspace_id = invoice_documents.workspace_id
      and invoice.status in ('sent', 'paid', 'overdue')
      and public.is_active_customer_member(
        invoice.customer_id,
        invoice.department_id
      )
  )
);

create or replace function public.assert_invoice_document_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $hive_invoice_document_scope$
declare
  v_workspace uuid;
  v_finalized boolean;
  v_legacy boolean;
begin
  select invoice.workspace_id, invoice.number_finalized, invoice.is_legacy
    into v_workspace, v_finalized, v_legacy
  from public.invoices invoice
  where invoice.id = new.invoice_id;

  if v_workspace is null
     or v_workspace is distinct from new.workspace_id then
    raise exception 'invoice document workspace mismatch';
  end if;

  if not v_finalized or v_legacy then
    raise exception 'invoice document requires a finalized non-legacy invoice';
  end if;

  if new.storage_path <> (
    new.workspace_id::text || '/invoices/' ||
    new.invoice_id::text || '/v' || new.version::text || '.pdf'
  ) then
    raise exception 'invoice document storage path mismatch';
  end if;

  return new;
end;
$hive_invoice_document_scope$;

revoke all on function public.assert_invoice_document_scope()
  from public, anon, authenticated;

drop trigger if exists invoice_documents_scope
  on public.invoice_documents;
create trigger invoice_documents_scope
before insert on public.invoice_documents
for each row execute function public.assert_invoice_document_scope();

create or replace function public.prevent_invoice_document_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $hive_invoice_document_immutable$
begin
  raise exception 'persisted invoice documents are immutable'
    using errcode = '55000';
end;
$hive_invoice_document_immutable$;

revoke all on function public.prevent_invoice_document_mutation()
  from public, anon, authenticated;

drop trigger if exists invoice_documents_immutable
  on public.invoice_documents;
create trigger invoice_documents_immutable
before update or delete on public.invoice_documents
for each row execute function public.prevent_invoice_document_mutation();

-- Supabase Cloud has Storage tables. The lightweight migration test database
-- may not, so bucket creation is guarded.
do $hive_invoice_document_bucket$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id, name, public)
    values('invoice-documents', 'invoice-documents', false)
    on conflict (id)
    do update set public = false;
  end if;
end;
$hive_invoice_document_bucket$;

commit;

-- Owner-scoped outbound email history and editable Studio templates.
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  template_key text not null check (template_key in ('invoice_send', 'offer_send', 'portal_invite', 'invoice_reminder')),
  subject_template text not null,
  text_template text not null,
  updated_at timestamptz not null default now(),
  unique (owner_id, template_key)
);

create table if not exists public.email_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  template_key text not null,
  status text not null check (status in ('sent', 'failed')),
  recipient_email text not null,
  recipient_name text not null default '',
  customer_id uuid references public.customers(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  offer_id uuid references public.offers(id) on delete set null,
  subject text not null,
  text_body text not null,
  provider_id text,
  error_message text,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create index if not exists email_delivery_logs_owner_created_idx
  on public.email_delivery_logs(owner_id, created_at desc);
create index if not exists email_delivery_logs_customer_idx
  on public.email_delivery_logs(customer_id, created_at desc);

create or replace function public.touch_email_template_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists email_templates_updated on public.email_templates;
create trigger email_templates_updated
before update on public.email_templates
for each row execute function public.touch_email_template_updated_at();

alter table public.email_templates enable row level security;
alter table public.email_delivery_logs enable row level security;

drop policy if exists "owner manages email templates" on public.email_templates;
create policy "owner manages email templates" on public.email_templates
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "owner reads email logs" on public.email_delivery_logs;
create policy "owner reads email logs" on public.email_delivery_logs
for select using (owner_id = auth.uid());

drop policy if exists "owner inserts email logs" on public.email_delivery_logs;
create policy "owner inserts email logs" on public.email_delivery_logs
for insert with check (owner_id = auth.uid());

revoke all on public.email_templates, public.email_delivery_logs from anon;
grant select, insert, update, delete on public.email_templates to authenticated;
grant select, insert on public.email_delivery_logs to authenticated;

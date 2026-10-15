-- Project workspace modules for Hive: tasks and deliverables.

begin;

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 240),
  description text not null default '' check (length(description) <= 8000),
  status text not null default 'todo'
    check (status in ('todo','in_progress','blocked','done')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high')),
  due_date date,
  position integer not null default 0 check (position >= 0),
  assigned_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'done') = (completed_at is not null))
);

create index if not exists project_tasks_workspace_project_idx
  on public.project_tasks(workspace_id, project_id, status, position, created_at);

create table if not exists public.project_deliverables (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 240),
  description text not null default '' check (length(description) <= 8000),
  status text not null default 'planned'
    check (status in ('planned','in_progress','review','approved','delivered')),
  due_date date,
  file_id uuid references public.customer_files(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'delivered') = (delivered_at is not null))
);

create index if not exists project_deliverables_workspace_project_idx
  on public.project_deliverables(workspace_id, project_id, status, created_at);

drop trigger if exists set_project_tasks_updated_at on public.project_tasks;
create trigger set_project_tasks_updated_at
before update on public.project_tasks
for each row execute function public.set_updated_at();

drop trigger if exists set_project_deliverables_updated_at on public.project_deliverables;
create trigger set_project_deliverables_updated_at
before update on public.project_deliverables
for each row execute function public.set_updated_at();

alter table public.project_tasks enable row level security;
alter table public.project_deliverables enable row level security;

drop policy if exists "workspace members manage project tasks" on public.project_tasks;
create policy "workspace members manage project tasks"
on public.project_tasks
for all
to authenticated
using (public.is_workspace_member(workspace_id, 'member'))
with check (
  public.is_workspace_member(workspace_id, 'member')
  and exists (
    select 1 from public.projects project
    where project.id = project_id
      and project.workspace_id = workspace_id
  )
);

drop policy if exists "workspace members manage project deliverables" on public.project_deliverables;
create policy "workspace members manage project deliverables"
on public.project_deliverables
for all
to authenticated
using (public.is_workspace_member(workspace_id, 'member'))
with check (
  public.is_workspace_member(workspace_id, 'member')
  and exists (
    select 1 from public.projects project
    where project.id = project_id
      and project.workspace_id = workspace_id
  )
);

grant select, insert, update, delete on public.project_tasks to authenticated;
grant select, insert, update, delete on public.project_deliverables to authenticated;

commit;

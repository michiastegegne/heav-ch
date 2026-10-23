import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const identityCoreUrl = new URL(
  "../supabase/migrations/20261016_zz_app_users_identity_core.sql",
  import.meta.url,
);
const clerkBridgeUrl = new URL(
  "../supabase/migrations/20261015_clerk_identity_bridge.sql",
  import.meta.url,
);

function functionBody(source, name) {
  const start = source.indexOf(`create or replace function public.${name}`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const after = source.slice(start);
  const end = after.indexOf("\nrevoke all on function");
  if (end < 0) throw new Error(`Missing end marker for ${name}`);
  return after.slice(0, end);
}

async function makeDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;

    create schema auth;
    create function auth.jwt()
    returns jsonb
    language sql
    stable
    as $$
      select coalesce(
        nullif(current_setting('request.jwt.claims', true), ''),
        '{}'
      )::jsonb
    $$;

    create type public.workspace_role as enum ('owner','admin','member','accountant');

    create table public.app_users (
      id uuid primary key,
      status text not null default 'active'
    );

    create table public.external_auth_identities (
      issuer text not null,
      subject text not null,
      app_user_id uuid not null references public.app_users(id),
      active boolean not null default true,
      primary key (issuer, subject)
    );

    create table public.workspaces (
      id uuid primary key,
      owner_id uuid not null references public.app_users(id),
      name text not null,
      status text not null default 'active'
    );

    create table public.workspace_memberships (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      user_id uuid not null references public.app_users(id),
      role public.workspace_role not null,
      unique (workspace_id, user_id)
    );

    create table public.customers (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      company text not null
    );

    create or replace function public.workspace_role_allows(
      p_role public.workspace_role,
      p_required public.workspace_role
    )
    returns boolean
    language sql
    immutable
    as $$
      select case p_required
        when 'owner' then p_role = 'owner'
        when 'admin' then p_role in ('owner','admin')
        when 'accountant' then p_role in ('owner','admin','accountant')
        else p_role in ('owner','admin','member','accountant')
      end
    $$;
  `);

  const identityCore = await readFile(identityCoreUrl, "utf8");
  const clerkBridge = await readFile(clerkBridgeUrl, "utf8");

  await db.exec(functionBody(identityCore, "current_app_user_id"));
  await db.exec(functionBody(clerkBridge, "is_workspace_member"));

  await db.exec(`
    revoke all on function public.current_app_user_id() from public, anon;
    grant execute on function public.current_app_user_id() to authenticated;
    revoke all on function public.is_workspace_member(uuid, public.workspace_role) from public, anon;
    grant execute on function public.is_workspace_member(uuid, public.workspace_role) to authenticated;

    alter table public.customers enable row level security;
    grant select, insert, update, delete on public.customers to authenticated;

    create policy "workspace customers isolated"
    on public.customers
    for all
    to authenticated
    using (public.is_workspace_member(workspace_id, 'member'))
    with check (public.is_workspace_member(workspace_id, 'member'));
  `);

  return db;
}

async function asClerk(db, subject) {
  await db.exec(`
    reset role;
    select set_config(
      'request.jwt.claims',
      '{"sub":"${subject}","iss":"https://clerk.example.test"}',
      false
    );
    set role authenticated;
  `);
}

test("Clerk subjects resolve to separate Hive users and RLS blocks cross-workspace reads/writes", async () => {
  const db = await makeDb();

  const userA = "10000000-0000-4000-8000-0000000000a1";
  const userB = "10000000-0000-4000-8000-0000000000b1";
  const workspaceA = "20000000-0000-4000-8000-0000000000a1";
  const workspaceB = "20000000-0000-4000-8000-0000000000b1";

  await db.exec(`
    insert into public.app_users(id) values
      ('${userA}'),
      ('${userB}');

    insert into public.external_auth_identities(
      issuer, subject, app_user_id, active
    ) values
      ('https://clerk.example.test', 'user_clerk_a', '${userA}', true),
      ('https://clerk.example.test', 'user_clerk_b', '${userB}', true);

    insert into public.workspaces(id, owner_id, name) values
      ('${workspaceA}', '${userA}', 'Workspace A'),
      ('${workspaceB}', '${userB}', 'Workspace B');

    insert into public.workspace_memberships(workspace_id, user_id, role) values
      ('${workspaceA}', '${userA}', 'owner'),
      ('${workspaceB}', '${userB}', 'owner');

    insert into public.customers(workspace_id, company) values
      ('${workspaceA}', 'Kunde A'),
      ('${workspaceB}', 'Kunde B');
  `);

  await asClerk(db, "user_clerk_a");
  assert.equal(
    (await db.query("select public.current_app_user_id() as id")).rows[0].id,
    userA,
  );
  assert.deepEqual(
    (await db.query("select company from public.customers order by company")).rows,
    [{ company: "Kunde A" }],
  );
  assert.equal(
    (await db.query(`select public.is_workspace_member('${workspaceB}', 'member') as allowed`)).rows[0].allowed,
    false,
  );
  await assert.rejects(
    db.query(`insert into public.customers(workspace_id, company) values ('${workspaceB}', 'Cross write A -> B')`),
    /row-level security|policy/i,
  );

  await asClerk(db, "user_clerk_b");
  assert.equal(
    (await db.query("select public.current_app_user_id() as id")).rows[0].id,
    userB,
  );
  assert.deepEqual(
    (await db.query("select company from public.customers order by company")).rows,
    [{ company: "Kunde B" }],
  );
  assert.equal(
    (await db.query(`select public.is_workspace_member('${workspaceA}', 'member') as allowed`)).rows[0].allowed,
    false,
  );
  await assert.rejects(
    db.query(`insert into public.customers(workspace_id, company) values ('${workspaceA}', 'Cross write B -> A')`),
    /row-level security|policy/i,
  );

  await db.close();
});

test("unknown or disabled Clerk identity resolves to no Hive actor", async () => {
  const db = await makeDb();
  const userA = "10000000-0000-4000-8000-0000000000a1";

  await db.exec(`
    insert into public.app_users(id, status) values ('${userA}', 'active');
    insert into public.external_auth_identities(
      issuer, subject, app_user_id, active
    ) values (
      'https://clerk.example.test',
      'user_clerk_a',
      '${userA}',
      false
    );
  `);

  await asClerk(db, "user_clerk_a");
  assert.equal(
    (await db.query("select public.current_app_user_id() as id")).rows[0].id,
    null,
  );

  await asClerk(db, "user_unknown");
  assert.equal(
    (await db.query("select public.current_app_user_id() as id")).rows[0].id,
    null,
  );

  await db.close();
});

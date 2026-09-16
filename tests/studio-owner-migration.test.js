import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const baseMigrationPath = new URL("../supabase/migrations/20260803_heav_admin.sql", import.meta.url);
const ownerMigrationPath = new URL("../supabase/migrations/20260916_studio_owner_authority_and_assistant.sql", import.meta.url);

async function databaseWithOwnerBoundary() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, email text unique);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `);
  const base = (await readFile(baseMigrationPath, "utf8")).replace("create extension if not exists pgcrypto;", "");
  await db.exec(base);
  return db;
}

test("nur bestehende Studio-Owner dürfen neue Geschäftsdaten und Assistent-Chats anlegen", async () => {
  const db = await databaseWithOwnerBoundary();
  const owner = "10000000-0000-4000-8000-000000000101";
  const client = "10000000-0000-4000-8000-000000000102";
  const forgedCustomer = "20000000-0000-4000-8000-000000000102";
  await db.exec(`
    insert into auth.users(id, email) values ('${owner}', 'admin@heav.ch'), ('${client}', 'client@example.com');
    insert into public.company_settings(owner_id, company_name, owner_name, email, address_line1, postal_code, city, iban)
    values
      ('${owner}', 'HEAV', 'Michias Tegegne', 'hello@heav.ch', 'Testweg 1', '8000', 'Zürich', 'CH9300762011623852957'),
      ('${client}', 'Fake', 'Client', 'client@example.com', 'Weg 3', '8000', 'Zürich', 'CH9300762011623852957');
    insert into public.customers(id, owner_id, company, email, address_line1, postal_code, city)
    values ('${forgedCustomer}', '${client}', 'Forged Kunde', 'forged@example.com', 'Weg 3', '8000', 'Zürich');
  `);
  await db.exec(await readFile(ownerMigrationPath, "utf8"));

  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${owner}', false);`);
  assert.equal((await db.query("select public.is_studio_owner() as allowed")).rows[0].allowed, true);
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${client}', false);`);
  assert.equal((await db.query("select public.is_studio_owner() as allowed")).rows[0].allowed, false);
  await db.exec("reset role");
  const seededOwners = await db.query("select user_id from public.studio_owners order by user_id");
  assert.deepEqual(seededOwners.rows, [{ user_id: owner }]);
  const signature = await db.query(`select pronargs from pg_proc where oid = 'public.is_studio_owner()'::regprocedure`);
  assert.equal(signature.rows[0].pronargs, 0);
  const guardedOwnerFunctions = await db.query(`select proname, prosrc from pg_proc join pg_namespace on pg_namespace.oid = pg_proc.pronamespace where nspname = 'public' and proname in ('create_invoice', 'record_invoice_action')`);
  assert.equal(guardedOwnerFunctions.rows.length, 2);
  assert.equal(guardedOwnerFunctions.rows.every((entry) => entry.prosrc.includes('is_studio_owner')), true);

  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${owner}', false);`);
  await db.query(`insert into public.customers(owner_id, company, email, address_line1, postal_code, city)
    values ('${owner}', 'Owner Kunde', 'owner@example.com', 'Testweg 2', '8000', 'Zürich')`);
  const thread = await db.query(`insert into public.assistant_threads(owner_id, title) values ('${owner}', 'Neues Projekt') returning id`);
  assert.ok(thread.rows[0].id);
  assert.equal((await db.query("select public.reserve_assistant_request('30000000-0000-4000-8000-000000000001') as allowed")).rows[0].allowed, true);
  assert.equal((await db.query("select public.reserve_assistant_request('30000000-0000-4000-8000-000000000002') as allowed")).rows[0].allowed, true);
  assert.equal((await db.query("select public.reserve_assistant_request('30000000-0000-4000-8000-000000000003') as allowed")).rows[0].allowed, false);
  await db.exec("reset role; update public.assistant_rate_limits set window_started = date_trunc('minute', now()) - interval '1 minute'; set role authenticated;");
  assert.equal((await db.query("select public.reserve_assistant_request('30000000-0000-4000-8000-000000000004') as allowed")).rows[0].allowed, false);
  await db.query("select public.release_assistant_request('30000000-0000-4000-8000-000000000001')");
  await db.query("select public.release_assistant_request('30000000-0000-4000-8000-000000000002')");
  for (let index = 0; index < 10; index += 1) {
    const requestId = `30000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`;
    assert.equal((await db.query(`select public.reserve_assistant_request('${requestId}') as allowed`)).rows[0].allowed, true);
    await db.query(`select public.release_assistant_request('${requestId}')`);
  }
  assert.equal((await db.query("select public.reserve_assistant_request('30000000-0000-4000-8000-000000000099') as allowed")).rows[0].allowed, false);

  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${client}', false);`);
  await db.query(`update public.company_settings set company_name = 'Escalated' where owner_id = '${client}'`);
  await db.exec("reset role");
  assert.equal((await db.query(`select company_name from public.company_settings where owner_id = '${client}'`)).rows[0].company_name, "Fake");
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${client}', false);`);
  await assert.rejects(
    db.query(`select public.create_invoice('${forgedCustomer}', null, 'FORGED-1', date '2026-09-16', date '2026-10-16', 8.1, '', '[{"description":"Forged","quantity":1,"unit_price_rappen":10000}]'::jsonb)`),
    /Studio-Zugriff erforderlich/i,
  );
  await assert.rejects(
    db.query(`insert into public.customers(owner_id, company, email, address_line1, postal_code, city)
      values ('${client}', 'Fake Kunde', 'fake@example.com', 'Weg 4', '8000', 'Zürich')`),
    /row-level security|policy/i,
  );
  await assert.rejects(
    db.query(`insert into public.studio_owners(user_id) values ('${client}')`),
    /permission denied/i,
  );
  await assert.rejects(
    db.query(`insert into public.assistant_threads(owner_id, title) values ('${client}', 'Nicht erlaubt')`),
    /row-level security|policy/i,
  );

  await db.close();
});

test("Assistent-Nachrichten bleiben an Thread und Owner gebunden", async () => {
  const db = await databaseWithOwnerBoundary();
  const owner = "10000000-0000-4000-8000-000000000111";
  const otherOwner = "10000000-0000-4000-8000-000000000112";
  await db.exec(`
    insert into auth.users(id, email) values ('${owner}', 'admin@heav.ch'), ('${otherOwner}', 'other@example.com');
    insert into public.company_settings(owner_id, company_name, owner_name, email, address_line1, postal_code, city, iban)
    values
      ('${owner}', 'HEAV', 'Owner', 'owner@example.com', 'Weg 1', '8000', 'Zürich', 'CH9300762011623852957'),
      ('${otherOwner}', 'Other', 'Other', 'other@example.com', 'Weg 2', '8000', 'Zürich', 'CH9300762011623852957');
  `);
  await db.exec(await readFile(ownerMigrationPath, "utf8"));
  await db.query(`insert into public.studio_owners(user_id) values ('${otherOwner}')`);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${owner}', false);`);
  const thread = (await db.query(`insert into public.assistant_threads(owner_id, title) values ('${owner}', 'Sicher') returning id`)).rows[0].id;
  await db.query(`insert into public.assistant_messages(thread_id, owner_id, role, content) values ('${thread}', '${owner}', 'user', 'Briefing')`);

  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${otherOwner}', false);`);
  assert.equal((await db.query(`select count(*)::int as count from public.assistant_threads where id = '${thread}'`)).rows[0].count, 0);
  await assert.rejects(
    db.query(`insert into public.assistant_messages(thread_id, owner_id, role, content) values ('${thread}', '${otherOwner}', 'user', 'Fremdzugriff')`),
    /thread owner mismatch|row-level security|policy/i,
  );
  await assert.rejects(
    db.query(`select public.delete_assistant_thread('${thread}')`),
    /Chat nicht gefunden/i,
  );

  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${owner}', false);`);
  await db.query(`select public.delete_assistant_thread('${thread}')`);
  assert.equal((await db.query(`select count(*)::int as count from public.assistant_threads where id = '${thread}'`)).rows[0].count, 0);
  assert.equal((await db.query(`select count(*)::int as count from public.assistant_messages where thread_id = '${thread}'`)).rows[0].count, 0);
  await db.close();
});

test("vollständige Migrationskette schützt alle owner-exponierten SECURITY DEFINER RPCs", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role supabase_auth_admin;
    create schema auth;
    create table auth.users (id uuid primary key, email text unique);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `);
  const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
  const files = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort((left, right) => {
    const leftVersion = BigInt(left.split("_")[0]);
    const rightVersion = BigInt(right.split("_")[0]);
    return leftVersion < rightVersion ? -1 : leftVersion > rightVersion ? 1 : left.localeCompare(right);
  });
  for (const file of files) {
    if (file === "20260916_studio_owner_authority_and_assistant.sql") {
      await db.exec(`
        insert into auth.users(id, email) values ('10000000-0000-4000-8000-000000000201', 'admin@heav.ch');
        insert into public.company_settings(owner_id, company_name, owner_name, email, address_line1, postal_code, city, iban)
        values ('10000000-0000-4000-8000-000000000201', 'HEAV', 'Owner', 'hello@heav.ch', 'Weg 1', '8000', 'Zürich', 'CH9300762011623852957');
      `);
    }
    const sql = (await readFile(new URL(file, migrationDirectory), "utf8")).replace("create extension if not exists pgcrypto;", "");
    await db.exec(sql);
  }

  const expected = [
    "complete_invoice_send", "create_invoice", "create_offer", "delete_customer", "delete_draft_invoice", "delete_project",
    "process_customer_portal_request", "record_invoice_action", "reserve_invoice_send", "share_customer_offer", "update_customer", "update_invoice", "update_project",
  ];
  const routines = await db.query(`
    select proname, prosrc from pg_proc join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where nspname = 'public' and proname = any($1::text[]) order by proname
  `, [expected]);
  assert.deepEqual(routines.rows.map((entry) => entry.proname), expected);
  assert.equal(routines.rows.every((entry) => entry.prosrc.includes("public.is_studio_owner()")), true);
  const portalAcceptance = await db.query(`select prosrc from pg_proc where oid = 'public.accept_customer_offer(uuid)'::regprocedure`);
  assert.doesNotMatch(portalAcceptance.rows[0].prosrc, /is_studio_owner/);
  await db.close();
});

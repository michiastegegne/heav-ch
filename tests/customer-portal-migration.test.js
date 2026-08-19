import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const adminMigrationPath = new URL("../supabase/migrations/20260803_heav_admin.sql", import.meta.url);
const optionalCustomerMigrationPath = new URL("../supabase/migrations/20260806_optional_customer_details.sql", import.meta.url);
const portalMigrationPath = new URL("../supabase/migrations/20260819_customer_portal.sql", import.meta.url);
const invitationMigrationPath = new URL("../supabase/migrations/20260820_customer_portal_invites.sql", import.meta.url);

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role supabase_auth_admin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create schema storage;
    create table storage.objects (id uuid primary key, bucket_id text not null, name text not null);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `);
  const adminMigration = (await readFile(adminMigrationPath, "utf8")).replace("create extension if not exists pgcrypto;", "");
  await db.exec(`${adminMigration}\n${await readFile(optionalCustomerMigrationPath, "utf8")}\n${await readFile(portalMigrationPath, "utf8")}\n${await readFile(invitationMigrationPath, "utf8")}`);
  return db;
}

test("ein aktiver Portalzugang sieht ausschliesslich seine Kundenprojekte, Rechnungen und Deliveries", async () => {
  const db = await createDatabase();
  const owner = "10000000-0000-4000-8000-000000000001";
  const clientA = "10000000-0000-4000-8000-000000000002";
  const clientB = "10000000-0000-4000-8000-000000000003";
  const customerA = "20000000-0000-4000-8000-000000000001";
  const customerB = "20000000-0000-4000-8000-000000000002";
  const projectA = "30000000-0000-4000-8000-000000000001";
  const projectB = "30000000-0000-4000-8000-000000000002";

  await db.exec(`
    insert into auth.users(id) values ('${owner}'), ('${clientA}'), ('${clientB}');
    select set_config('request.jwt.claim.sub', '${owner}', false);
    insert into public.customers(id, owner_id, company, email, address_line1, postal_code, city) values
      ('${customerA}', '${owner}', 'Alpha AG', 'alpha@example.test', 'A-Weg 1', '8000', 'Zürich'),
      ('${customerB}', '${owner}', 'Beta AG', 'beta@example.test', 'B-Weg 1', '3000', 'Bern');
    insert into public.projects(id, owner_id, customer_id, title) values
      ('${projectA}', '${owner}', '${customerA}', 'Alpha Film'),
      ('${projectB}', '${owner}', '${customerB}', 'Beta Film');
    insert into public.invoices(id, owner_id, customer_id, project_id, invoice_number, issue_date, due_date, status, subtotal_rappen, tax_rappen, total_rappen) values
      ('40000000-0000-4000-8000-000000000001', '${owner}', '${customerA}', '${projectA}', 'HEAV-001', '2026-08-19', '2026-09-18', 'sent', 10000, 0, 10000),
      ('40000000-0000-4000-8000-000000000002', '${owner}', '${customerB}', '${projectB}', 'HEAV-002', '2026-08-19', '2026-09-18', 'paid', 20000, 0, 20000);
    insert into public.customer_portal_memberships(owner_id, customer_id, user_id, role) values
      ('${owner}', '${customerA}', '${clientA}', 'client'),
      ('${owner}', '${customerB}', '${clientB}', 'client');
    insert into public.customer_files(owner_id, customer_id, project_id, title, original_filename, storage_path, kind, published_at) values
      ('${owner}', '${customerA}', '${projectA}', 'Finale Galerie', 'alpha-final.zip', 'customers/${customerA}/alpha-final.zip', 'gallery', now()),
      ('${owner}', '${customerB}', '${projectB}', 'Beta Video', 'beta-film.mp4', 'customers/${customerB}/beta-film.mp4', 'video', now());
    insert into storage.objects(id, bucket_id, name) values
      ('50000000-0000-4000-8000-000000000001', 'customer-deliveries', 'customers/${customerA}/alpha-final.zip'),
      ('50000000-0000-4000-8000-000000000002', 'customer-deliveries', 'customers/${customerB}/beta-film.mp4');
    select set_config('request.jwt.claim.sub', '${clientA}', false);
    set role authenticated;
  `);

  const projects = await db.query("select title from public.projects order by title");
  const invoices = await db.query("select invoice_number from public.invoices order by invoice_number");
  const files = await db.query("select original_filename from public.customer_files order by original_filename");
  const storageObjects = await db.query("select name from storage.objects order by name");
  assert.deepEqual(projects.rows, [{ title: "Alpha Film" }]);
  assert.deepEqual(invoices.rows, [{ invoice_number: "HEAV-001" }]);
  assert.deepEqual(files.rows, [{ original_filename: "alpha-final.zip" }]);
  assert.deepEqual(storageObjects.rows, [{ name: `customers/${customerA}/alpha-final.zip` }]);
  await db.close();
});

test("Kunden können Bewertungen einreichen, aber deren Veröffentlichung nicht selbst steuern", async () => {
  const db = await createDatabase();
  const owner = "10000000-0000-4000-8000-000000000001";
  const client = "10000000-0000-4000-8000-000000000002";
  const customer = "20000000-0000-4000-8000-000000000001";
  await db.exec(`
    insert into auth.users(id) values ('${owner}'), ('${client}');
    select set_config('request.jwt.claim.sub', '${owner}', false);
    insert into public.customers(id, owner_id, company, email, address_line1, postal_code, city)
      values ('${customer}', '${owner}', 'Alpha AG', 'alpha@example.test', 'A-Weg 1', '8000', 'Zürich');
    insert into public.customer_portal_memberships(owner_id, customer_id, user_id, role)
      values ('${owner}', '${customer}', '${client}', 'client');
    select set_config('request.jwt.claim.sub', '${client}', false);
    set role authenticated;
    insert into public.customer_reviews(customer_id, author_id, reviewer_name, body)
      values ('${customer}', '${client}', 'Alex Muster', 'Die Zusammenarbeit war hervorragend.');
  `);
  const review = await db.query("select status, reviewer_name from public.customer_reviews");
  assert.deepEqual(review.rows, [{ status: "pending", reviewer_name: "Alex Muster" }]);
  const updateAttempt = await db.query("update public.customer_reviews set status = 'approved', published_at = now() returning id");
  assert.equal(updateAttempt.rows.length, 0, "ein Kunde darf seine eigene Bewertung nicht veröffentlichen");
  await db.close();
});

test("nur eine von HEAV angelegte, nicht abgelaufene Einladung öffnet die Kundenkonto-Erstellung", async () => {
  const db = await createDatabase();
  const owner = "10000000-0000-4000-8000-000000000001";
  const customer = "20000000-0000-4000-8000-000000000001";
  await db.exec(`
    insert into auth.users(id) values ('${owner}');
    select set_config('request.jwt.claim.sub', '${owner}', false);
    insert into public.customers(id, owner_id, company, email, address_line1, postal_code, city)
      values ('${customer}', '${owner}', 'Alpha AG', 'alpha@example.test', 'A-Weg 1', '8000', 'Zürich');
    insert into public.customer_portal_invites(owner_id, customer_id, email, expires_at)
      values ('${owner}', '${customer}', 'client@example.test', now() + interval '7 days');
  `);
  const allowed = await db.query(`select public.hook_restrict_heav_signup('{"user":{"email":"client@example.test"}}'::jsonb) as result`);
  const denied = await db.query(`select public.hook_restrict_heav_signup('{"user":{"email":"unknown@example.test"}}'::jsonb) as result`);
  assert.deepEqual(allowed.rows[0].result, {});
  assert.equal(denied.rows[0].result.error.http_code, 403);
  await db.close();
});

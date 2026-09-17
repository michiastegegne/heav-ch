import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrationPath = new URL("../supabase/migrations/20260918_departments_activity_log.sql", import.meta.url);
const migrationFiles = [
  "20260803_heav_admin.sql",
  "20260806_optional_customer_details.sql",
  "20260810_portal_reliability.sql",
  "20260812_invoice_project_snapshot.sql",
  "20260813_editable_portal_records.sql",
  "20260814_edit_legacy_invoice_records.sql",
  "20260819_customer_portal.sql",
  "20260820_customer_portal_invites.sql",
  "20260821_portal_request_actions.sql",
  "20260830_invoice_discounts_and_item_order.sql",
  "20260910_customer_offers.sql",
  "20260910153000_offer_email_events.sql",
];

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
  const migrations = [];
  for (const file of migrationFiles) {
    const source = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
    migrations.push(file === "20260803_heav_admin.sql" ? source.replace("create extension if not exists pgcrypto;", "") : source);
  }
  migrations.push("create function public.is_studio_owner() returns boolean language sql stable as $$ select true $$;");
  migrations.push(await readFile(migrationPath, "utf8"));
  await db.exec(migrations.join("\n"));
  return db;
}

test("Abteilungen begrenzen Portal-Memberships und erzeugen eine zentrale Aktivitätschronik", async () => {
  const db = await createDatabase();
  const owner = "10000000-0000-4000-8000-000000000001";
  const portalUser = "10000000-0000-4000-8000-000000000002";
  const customer = "20000000-0000-4000-8000-000000000001";
  await db.exec(`
    insert into auth.users(id) values ('${owner}'), ('${portalUser}');
    select set_config('request.jwt.claim.sub', '${owner}', false);
    insert into public.customers(id, owner_id, company, email, address_line1, postal_code, city)
      values ('${customer}', '${owner}', 'Heilsarmee Schweiz', 'heilsarmee@example.test', 'Testweg 1', '3000', 'Bern');
    insert into public.company_settings(owner_id, address_line1, postal_code, city, iban)
      values ('${owner}', 'Testweg 1', '3000', 'Bern', 'CH9300762011623852957');
  `);

  const departments = await db.query("select id, name from public.customer_departments where customer_id = $1 order by created_at", [customer]);
  assert.equal(departments.rows.length, 1);
  const defaultDepartment = departments.rows[0].id;
  assert.equal(departments.rows[0].name, "Allgemein");

  const request = "50000000-0000-4000-8000-000000000001";
  await db.query(`insert into public.customer_portal_requests(id, owner_id, company, contact_name, email, phone, message) values ('${request}', '${owner}', 'Heilsarmee Schweiz', 'Bestehender Kontakt', 'heilsarmee@example.test', '+41 79 000 00 00', 'Bitte Zugang einrichten')`);
  const acceptedCustomer = await db.query("select public.process_customer_portal_request($1, 'accept') as customer_id", [request]);
  assert.equal(acceptedCustomer.rows[0].customer_id, customer);
  const customerCount = await db.query("select count(*)::int as count from public.customers where owner_id = $1", [owner]);
  assert.equal(customerCount.rows[0].count, 1);

  const youth = "30000000-0000-4000-8000-000000000001";
  await db.query(`insert into public.customer_departments(id, owner_id, customer_id, name, contact_name, contact_email) values ('${youth}', '${owner}', '${customer}', 'Jugend', 'Nina Jugend', 'jugend@example.test')`);
  const project = "40000000-0000-4000-8000-000000000001";
  await db.query(`insert into public.projects(id, owner_id, customer_id, department_id, title) values ('${project}', '${owner}', '${customer}', '${youth}', 'Jugendproduktion')`);
  const storedProject = await db.query("select department_id from public.projects where id = $1", [project]);
  assert.equal(storedProject.rows[0].department_id, youth);

  await db.query(`insert into public.customer_portal_memberships(owner_id, customer_id, department_id, user_id, status) values ('${owner}', '${customer}', '${youth}', '${portalUser}', 'active')`);
  await db.query(`select set_config('request.jwt.claim.sub', '${portalUser}', false)`);
  const access = await db.query("select public.is_active_customer_member($1, $2) as allowed, public.is_active_customer_member($1, $3) as denied", [customer, youth, defaultDepartment]);
  assert.equal(access.rows[0].allowed, true);
  assert.equal(access.rows[0].denied, false);

  await db.query(`select set_config('request.jwt.claim.sub', '${owner}', false)`);
  const activity = await db.query("select event_type, entity_type, summary, department_id from public.activity_events where entity_id = $1", [project]);
  assert.deepEqual(activity.rows, [{ event_type: "project.created", entity_type: "project", summary: "Projekt erstellt: Jugendproduktion", department_id: youth }]);

  const invoiceResult = await db.query(`select * from public.create_invoice_in_department('${customer}', '${project}', '2026-09-17', '2026-10-17', 0, 'Jugend-Rechnung', '[{"description":"Produktion","quantity":1,"unit_price_rappen":10000}]'::jsonb, '${youth}')`);
  const storedInvoice = await db.query("select department_id from public.invoices where id = $1", [invoiceResult.rows[0].invoice_id]);
  assert.equal(storedInvoice.rows[0].department_id, youth);

  const offerResult = await db.query(`select * from public.create_offer_in_department('${customer}', '${project}', 'Jugend-Offerte', '2026-09-17', '2026-10-17', 0, 'Hinweis', 'Mit der Annahme verbindlich', '[{"description":"Produktion","quantity":1,"unit_price_rappen":10000}]'::jsonb, '${youth}')`);
  const storedOffer = await db.query("select department_id, status from public.offers where id = $1", [offerResult.rows[0].offer_id]);
  assert.equal(storedOffer.rows[0].department_id, youth);
  assert.equal(storedOffer.rows[0].status, "draft");
  await db.query("select public.share_customer_offer($1)", [offerResult.rows[0].offer_id]);
  const sharedOffer = await db.query("select status from public.offers where id = $1", [offerResult.rows[0].offer_id]);
  assert.equal(sharedOffer.rows[0].status, "sent");
  await db.close();
});

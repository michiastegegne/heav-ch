import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

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
  "20260918_departments_activity_log.sql",
];

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role supabase_auth_admin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create schema storage;
    create table storage.objects (id uuid primary key, bucket_id text not null, name text not null);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `);
  for (const file of migrationFiles) {
    const source = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
    await db.exec(file === "20260803_heav_admin.sql" ? source.replace("create extension if not exists pgcrypto;", "") : source);
  }
  await db.exec("create function public.is_studio_owner() returns boolean language sql stable as $$ select true $$;");
  return db;
}

test("Kundenlöschung entfernt alle verknüpften CRM-, Portal- und Finanzdatensätze atomar", async () => {
  const db = await createDatabase();
  const owner = "10000000-0000-4000-8000-000000000101";
  const portalUser = "10000000-0000-4000-8000-000000000102";
  const customer = "20000000-0000-4000-8000-000000000101";
  const project = "30000000-0000-4000-8000-000000000101";
  const request = "40000000-0000-4000-8000-000000000101";
  await db.exec(`
    insert into auth.users(id, email) values ('${owner}', 'owner@example.test'), ('${portalUser}', 'contact@example.test');
    select set_config('request.jwt.claim.sub', '${owner}', false);
    insert into public.company_settings(owner_id, address_line1, postal_code, city, iban)
      values ('${owner}', 'Testweg 1', '3000', 'Bern', 'CH9300762011623852957');
    insert into public.customers(id, owner_id, company, email, address_line1, postal_code, city)
      values ('${customer}', '${owner}', 'Delete AG', 'contact@example.test', 'Testweg 2', '3000', 'Bern');
  `);
  const department = (await db.query("select id from public.customer_departments where customer_id = $1", [customer])).rows[0].id;
  await db.query("insert into public.projects(id, owner_id, customer_id, department_id, title) values ($1, $2, $3, $4, 'Delete Projekt')", [project, owner, customer, department]);
  await db.query("insert into public.customer_portal_memberships(owner_id, customer_id, department_id, user_id, status) values ($1, $2, $3, $4, 'active')", [owner, customer, department, portalUser]);
  await db.query("insert into public.customer_files(owner_id, customer_id, project_id, title, original_filename, storage_path, kind) values ($1, $2, $3, 'Datei', 'datei.pdf', 'delete/datei.pdf', 'document')", [owner, customer, project]);
  await db.query("insert into public.customer_portal_requests(id, owner_id, customer_id, company, contact_name, email, status, reviewed_at) values ($1, $2, $3, 'Delete AG', 'Kontakt Person', 'contact@example.test', 'accepted', now())", [request, owner, customer]);
  const invoice = (await db.query(`select * from public.create_invoice_in_department($1, $2, '2026-09-17', '2026-10-17', 0, '', '[{"description":"Leistung","quantity":1,"unit_price_rappen":10000}]'::jsonb, $3)`, [customer, project, department])).rows[0].invoice_id;
  const offer = (await db.query(`select * from public.create_offer_in_department($1, $2, 'Delete Offerte', '2026-09-17', '2026-10-17', 0, '', 'Mit der Annahme verbindlich', '[{"description":"Leistung","quantity":1,"unit_price_rappen":10000}]'::jsonb, $3)`, [customer, project, department])).rows[0].offer_id;

  await db.query("select public.delete_customer($1)", [customer]);

  for (const table of ["customers", "customer_departments", "projects", "invoices", "invoice_items", "invoice_events", "offers", "offer_items", "offer_events", "customer_files", "customer_portal_memberships", "customer_portal_invites", "customer_portal_requests", "activity_events"]) {
    const result = await db.query(`select count(*)::int as count from public.${table} where customer_id = $1`, [customer]).catch(() => ({ rows: [{ count: 0 }] }));
    assert.equal(result.rows[0].count, 0, `${table} still contains linked rows`);
  }
  assert.equal((await db.query("select count(*)::int as count from public.invoices where id = $1", [invoice])).rows[0].count, 0);
  assert.equal((await db.query("select count(*)::int as count from public.offers where id = $1", [offer])).rows[0].count, 0);
  await db.close();
});

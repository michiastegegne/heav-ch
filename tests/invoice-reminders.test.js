import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrations = [
  "20260803_heav_admin.sql", "20260806_optional_customer_details.sql", "20260810_portal_reliability.sql",
  "20260812_invoice_project_snapshot.sql", "20260813_editable_portal_records.sql", "20260814_edit_legacy_invoice_records.sql",
  "20260819_customer_portal.sql", "20260820_customer_portal_invites.sql", "20260821_portal_request_actions.sql",
  "20260830_invoice_discounts_and_item_order.sql", "20260910_customer_offers.sql", "20260910153000_offer_email_events.sql",
 "20260918_departments_activity_log.sql", "20260919_invoice_reminders.sql",
];

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role supabase_auth_admin; create role service_role;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create schema storage; create table storage.objects (id uuid primary key, bucket_id text not null, name text not null);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  for (const file of migrations) {
    if (file === "20260918_departments_activity_log.sql") await db.exec("create function public.is_studio_owner() returns boolean language sql stable as $$ select true $$;");
    const source = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
    await db.exec(file === "20260803_heav_admin.sql" ? source.replace("create extension if not exists pgcrypto;", "") : source);
  }
  return db;
}

test("Rechnungserinnerung wird sieben Tage vor Fälligkeit genau einmal geplant", async () => {
  const db = await database();
  const owner = "10000000-0000-4000-8000-000000000201";
  const customer = "20000000-0000-4000-8000-000000000201";
  await db.exec(`
    insert into auth.users(id, email) values ('${owner}', 'owner@example.test');
    select set_config('request.jwt.claim.sub', '${owner}', false);
    insert into public.company_settings(owner_id, address_line1, postal_code, city, iban, invoice_reminder_days)
      values ('${owner}', 'Testweg 1', '3000', 'Bern', 'CH9300762011623852957', 7);
    insert into public.customers(id, owner_id, company, contact_name, email, address_line1, postal_code, city)
      values ('${customer}', '${owner}', 'Reminder AG', 'Anna Keller', 'anna@example.test', 'Testweg 2', '3000', 'Bern');
  `);
  const department = (await db.query("select id from public.customer_departments where customer_id = $1", [customer])).rows[0].id;
  const invoice = (await db.query(`select * from public.create_invoice_in_department($1, null, '2026-09-17', '2026-09-24', 0, '', '[{"description":"Leistung","quantity":1,"unit_price_rappen":10000}]'::jsonb, $2)`, [customer, department])).rows[0].invoice_id;
  await db.query("update public.invoices set status = 'sent', sent_at = now() where id = $1", [invoice]);
  const claimed = await db.query("select * from public.claim_invoice_reminders('2026-09-17')");
  assert.equal(claimed.rows.length, 1);
  assert.equal(claimed.rows[0].recipient_first_name, "Anna");
  assert.equal(claimed.rows[0].recipient_email, "anna@example.test");
  const repeated = await db.query("select * from public.claim_invoice_reminders('2026-09-17')");
  assert.equal(repeated.rows.length, 1);
  await db.query("select public.complete_invoice_reminder($1, true, 'reminder_1', null)", [claimed.rows[0].reminder_id]);
  const afterSend = await db.query("select * from public.claim_invoice_reminders('2026-09-17')");
  assert.equal(afterSend.rows.length, 0);
  const event = await db.query("select kind from public.invoice_events where invoice_id = $1 and kind = 'reminder_sent'", [invoice]);
  assert.equal(event.rows.length, 1);
  await db.close();
});

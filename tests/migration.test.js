import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrationPath = new URL("../supabase/migrations/20260803_heav_admin.sql", import.meta.url);

test("Supabase-Migration läuft semantisch und erstellt Rechnungen atomar", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `);
  const migration = (await readFile(migrationPath, "utf8")).replace("create extension if not exists pgcrypto;", "");
  await db.exec(migration);

  const owner = "10000000-0000-4000-8000-000000000001";
  const customer = "20000000-0000-4000-8000-000000000001";
  await db.exec(`
    insert into auth.users(id) values ('${owner}');
    select set_config('request.jwt.claim.sub', '${owner}', false);
    insert into public.customers(id, owner_id, company, email, address_line1, postal_code, city)
    values ('${customer}', '${owner}', 'Testkunde AG', 'mail@test.example', 'Testweg 1', '8000', 'Zürich');
  `);

  await assert.rejects(
    db.query(`select public.create_invoice('${customer}', null, 'HEAV-NULL-ITEMS', '2026-08-03', '2026-09-02', 8.1, '', null)`),
    /items must be an array/,
  );

  const created = await db.query(`
    select public.create_invoice(
      '${customer}', null, 'HEAV-TEST-001', '2026-08-03', '2026-09-02', 8.1, '',
      '[{"description":"Produktion","quantity":1,"unit_price_rappen":100000}]'::jsonb
    ) as id
  `);
  const invoiceId = created.rows[0].id;
  const invoice = await db.query(`select subtotal_rappen, tax_rappen, total_rappen, status from public.invoices where id = '${invoiceId}'`);
  assert.deepEqual(invoice.rows[0], { subtotal_rappen: 100000, tax_rappen: 8100, total_rappen: 108100, status: "draft" });

  await db.query(`select public.record_invoice_action('${invoiceId}', 'sent', 'mail@test.example', '{"resend_id":"test"}'::jsonb)`);
  const sent = await db.query(`select status, sent_at is not null as has_sent_at from public.invoices where id = '${invoiceId}'`);
  assert.deepEqual(sent.rows[0], { status: "sent", has_sent_at: true });

  const events = await db.query(`select kind from public.invoice_events where invoice_id = '${invoiceId}' order by created_at, kind`);
  assert.deepEqual(events.rows.map((row) => row.kind).sort(), ["created", "sent"]);
  const privileges = await db.query(`select
    has_table_privilege('authenticated', 'public.invoices', 'select') as can_select,
    has_table_privilege('authenticated', 'public.invoices', 'insert') as can_insert,
    has_table_privilege('authenticated', 'public.invoice_items', 'update') as can_edit_items`);
  assert.deepEqual(privileges.rows[0], { can_select: true, can_insert: false, can_edit_items: false });
  await db.close();
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrationPath = new URL("../supabase/migrations/20260803_heav_admin.sql", import.meta.url);
const reliabilityMigrationPath = new URL("../supabase/migrations/20260810_portal_reliability.sql", import.meta.url);

async function createMigrationDatabase() {
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
  const baseMigration = (await readFile(migrationPath, "utf8")).replace("create extension if not exists pgcrypto;", "");
  await db.exec(baseMigration);
  return db;
}

function creditorReferenceIsValid(reference) {
  const compact = reference.replace(/\s+/g, "").toUpperCase();
  const rearranged = `${compact.slice(4)}${compact.slice(0, 4)}`;
  const expanded = rearranged.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of expanded) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

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

test("Rechnungsnummer und QR-Referenz werden atomar fortlaufend vergeben und nie wiederverwendet", async () => {
  const db = await createMigrationDatabase();
  const owner = "10000000-0000-4000-8000-000000000011";
  const customer = "20000000-0000-4000-8000-000000000011";
  await db.exec(`
    insert into auth.users(id) values ('${owner}');
    select set_config('request.jwt.claim.sub', '${owner}', false);
    insert into public.customers(id, owner_id, company, email, address_line1, postal_code, city)
    values ('${customer}', '${owner}', 'Referenz Test AG', 'mail@test.example', 'Testweg 1', '8000', 'Zürich');
    insert into public.company_settings(owner_id, company_name, owner_name, email, address_line1, postal_code, city, iban, vat_number)
    values ('${owner}', 'HEAV', 'Michias Tegegne', 'hello@heav.ch', 'Teststrasse 2', '4051', 'Basel', 'CH8200769420675792002', 'CHE-123.456.789 MWST');
    select public.create_invoice(
      '${customer}', null, 'HEAV-2026-007', '2026-08-01', '2026-08-31', 8.1, '',
      '[{"description":"Bestehend","quantity":1,"unit_price_rappen":10000}]'::jsonb
    );
  `);

  const reliabilityMigration = await readFile(reliabilityMigrationPath, "utf8");
  await db.exec(reliabilityMigration);

  const first = await db.query(`
    select * from public.create_invoice(
      '${customer}', null, '2026-08-10', '2026-09-09', 8.1, '',
      '[{"description":"Produktion","quantity":1,"unit_price_rappen":100000}]'::jsonb
    )
  `);
  assert.equal(first.rows[0].invoice_number, "HEAV-2026-008");
  assert.match(first.rows[0].payment_reference, /^RF\d{2}HEAV2026000008$/);
  assert.equal(creditorReferenceIsValid(first.rows[0].payment_reference), true);

  await db.query(`select public.delete_draft_invoice('${first.rows[0].invoice_id}')`);
  const second = await db.query(`
    select * from public.create_invoice(
      '${customer}', null, '2026-08-10', '2026-09-09', 8.1, '',
      '[{"description":"Postproduktion","quantity":1,"unit_price_rappen":50000}]'::jsonb
    )
  `);
  assert.equal(second.rows[0].invoice_number, "HEAV-2026-009");
  assert.notEqual(second.rows[0].payment_reference, first.rows[0].payment_reference);

  const sentAttempt = (await db.query(`select * from public.reserve_invoice_send('${second.rows[0].invoice_id}', '40000000-0000-4000-8000-000000000001')`)).rows[0];
  await db.query(`select public.complete_invoice_send('${sentAttempt.attempt_id}', true, 'mail@test.example', '{"resend_id":"email_sent"}'::jsonb)`);
  await assert.rejects(db.query(`select public.record_invoice_action('${second.rows[0].invoice_id}', 'sent', 'mail@test.example', '{}'::jsonb)`), /invalid invoice action/);
  await assert.rejects(
    db.query(`select public.delete_draft_invoice('${second.rows[0].invoice_id}')`),
    /only draft invoices can be deleted/,
  );
  await db.query(`select public.record_invoice_action('${second.rows[0].invoice_id}', 'cancelled', null, '{}'::jsonb)`);
  const cancelled = await db.query(`select status from public.invoices where id = '${second.rows[0].invoice_id}'`);
  assert.equal(cancelled.rows[0].status, "cancelled");
  await assert.rejects(
    db.query(`select public.record_invoice_action('${second.rows[0].invoice_id}', 'downloaded', null, '{}'::jsonb)`),
    /cancelled invoice cannot be downloaded/,
  );

  const parallel = await Promise.all(Array.from({ length: 8 }, (_, index) => db.query(`
    select * from public.create_invoice(
      '${customer}', null, '2026-08-10', '2026-09-09', 8.1, '',
      '[{"description":"Parallel ${index + 1}","quantity":1,"unit_price_rappen":1000}]'::jsonb
    )
  `)));
  const numbers = parallel.map((result) => result.rows[0].invoice_number);
  const references = parallel.map((result) => result.rows[0].payment_reference);
  assert.equal(new Set(numbers).size, 8);
  assert.equal(new Set(references).size, 8);
  assert.deepEqual([...numbers].sort(), Array.from({ length: 8 }, (_, index) => `HEAV-2026-${String(index + 10).padStart(3, "0")}`));

  await db.query(`update public.invoice_number_counters set last_value = 998 where owner_id = '${owner}' and invoice_year = 2026`);
  const boundary = [];
  for (const description of ["Nummer 999", "Nummer 1000"]) {
    boundary.push((await db.query(`select * from public.create_invoice(
      '${customer}', null, '2026-08-10', '2026-09-09', 8.1, '',
      '[{"description":"${description}","quantity":1,"unit_price_rappen":1000}]'::jsonb
    )`)).rows[0]);
  }
  assert.deepEqual(boundary.map((row) => row.invoice_number), ["HEAV-2026-999", "HEAV-2026-1000"]);
  assert(boundary.every((row) => creditorReferenceIsValid(row.payment_reference)));

  const sendInvoice = (await db.query(`select * from public.create_invoice(
    '${customer}', null, '2026-08-10', '2026-09-09', 8.1, '',
    '[{"description":"Versandtest","quantity":1,"unit_price_rappen":1000}]'::jsonb
  )`)).rows[0];
  const reserved = (await db.query(`select * from public.reserve_invoice_send('${sendInvoice.invoice_id}', '40000000-0000-4000-8000-000000000002')`)).rows[0];
  const duplicateReservation = (await db.query(`select * from public.reserve_invoice_send('${sendInvoice.invoice_id}', '40000000-0000-4000-8000-000000000002')`)).rows[0];
  assert.deepEqual(duplicateReservation, reserved);
  await db.query(`update public.invoice_send_attempts set created_at = now() - interval '1 day' where id = '${reserved.attempt_id}'`);
  const ambiguousRetry = (await db.query(`select * from public.reserve_invoice_send('${sendInvoice.invoice_id}', '40000000-0000-4000-8000-000000000099')`)).rows[0];
  assert.deepEqual(ambiguousRetry, reserved);
  await assert.rejects(db.query(`select public.record_invoice_action('${sendInvoice.invoice_id}', 'cancelled', null, '{}'::jsonb)`), /send is in progress/);
  await assert.rejects(db.query(`select public.delete_draft_invoice('${sendInvoice.invoice_id}')`), /send is in progress/);
  await db.query(`select public.complete_invoice_send('${reserved.attempt_id}', true, 'mail@test.example', '{"resend_id":"email_123"}'::jsonb)`);
  await db.query(`select public.complete_invoice_send('${reserved.attempt_id}', true, 'mail@test.example', '{"resend_id":"email_123"}'::jsonb)`);
  const lostResponseRetry = (await db.query(`select * from public.reserve_invoice_send('${sendInvoice.invoice_id}', '40000000-0000-4000-8000-000000000002')`)).rows[0];
  assert.deepEqual(lostResponseRetry, reserved);
  const explicitResend = (await db.query(`select * from public.reserve_invoice_send('${sendInvoice.invoice_id}', '40000000-0000-4000-8000-000000000003')`)).rows[0];
  assert.notEqual(explicitResend.attempt_id, reserved.attempt_id);
  await db.query(`select public.complete_invoice_send('${explicitResend.attempt_id}', false, 'mail@test.example', '{"message":"Test beendet"}'::jsonb)`);
  assert.equal((await db.query(`select status from public.invoices where id = '${sendInvoice.invoice_id}'`)).rows[0].status, "sent");
  await db.query(`update public.company_settings set vat_number = 'x', default_tax_rate = 0 where owner_id = '${owner}'`);
  await assert.rejects(db.query(`select * from public.create_invoice(
    '${customer}', null, '2026-08-10', '2026-09-09', 8.1, '',
    '[{"description":"Unzulässige MWST","quantity":1,"unit_price_rappen":1000}]'::jsonb
  )`), /gültige Schweizer MWST-Nummer/);
  const withoutVat = (await db.query(`select * from public.create_invoice(
    '${customer}', null, '2026-08-10', '2026-09-09', 0, '',
    '[{"description":"Ohne MWST","quantity":1,"unit_price_rappen":1000}]'::jsonb
  )`)).rows[0];
  assert.ok(withoutVat.invoice_id);
  await db.close();
});

test("Kunden und Projekte können sicher gelöscht werden, historische Rechnungen bleiben geschützt", async () => {
  const db = await createMigrationDatabase();
  const reliabilityMigration = await readFile(reliabilityMigrationPath, "utf8");
  await db.exec(reliabilityMigration);
  const owner = "10000000-0000-4000-8000-000000000021";
  const customer = "20000000-0000-4000-8000-000000000021";
  const project = "30000000-0000-4000-8000-000000000021";
  const disposableCustomer = "20000000-0000-4000-8000-000000000022";
  const disposableProject = "30000000-0000-4000-8000-000000000022";
  await db.exec(`
    insert into auth.users(id) values ('${owner}');
    select set_config('request.jwt.claim.sub', '${owner}', false);
    insert into public.customers(id, owner_id, company, email, address_line1, postal_code, city)
    values ('${customer}', '${owner}', 'Löschtest AG', 'mail@test.example', 'Testweg 1', '8000', 'Zürich');
    insert into public.company_settings(owner_id, company_name, owner_name, email, address_line1, postal_code, city, iban, vat_number)
    values ('${owner}', 'HEAV', 'Michias Tegegne', 'hello@heav.ch', 'Teststrasse 2', '4051', 'Basel', 'CH8200769420675792002', 'CHE-123.456.789 MWST');
    insert into public.projects(id, owner_id, customer_id, title)
    values ('${project}', '${owner}', '${customer}', 'Historisches Projekt');
    insert into public.customers(id, owner_id, company, email, address_line1, postal_code, city)
    values ('${disposableCustomer}', '${owner}', 'Temporär AG', 'temp@test.example', 'Nebenweg 2', '8000', 'Zürich');
    insert into public.projects(id, owner_id, customer_id, title)
    values ('${disposableProject}', '${owner}', '${disposableCustomer}', 'Temporäres Projekt');
  `);
  const created = await db.query(`select * from public.create_invoice(
    '${customer}', '${project}', '2026-08-10', '2026-09-09', 8.1, '',
    '[{"description":"Historische Leistung","quantity":1,"unit_price_rappen":100000}]'::jsonb
  )`);
  const invoiceId = created.rows[0].invoice_id;

  await db.exec(`
    update public.customers set company = 'Nachträglich geändert AG', email = 'neu@test.example' where id = '${customer}';
    update public.company_settings set company_name = 'Andere Firma', iban = 'CH3600000000000000000' where owner_id = '${owner}';
  `);
  const snapshots = await db.query(`select customer_snapshot->>'company' as customer_company,
    customer_snapshot->>'email' as customer_email, issuer_snapshot->>'company_name' as issuer_company,
    issuer_snapshot->>'iban' as issuer_iban from public.invoices where id = '${invoiceId}'`);
  assert.deepEqual(snapshots.rows[0], {
    customer_company: "Löschtest AG",
    customer_email: "mail@test.example",
    issuer_company: "HEAV",
    issuer_iban: "CH8200769420675792002",
  });

  await assert.rejects(db.query(`select public.delete_project('${project}')`), /project has invoices/);
  await assert.rejects(db.query(`select public.delete_customer('${customer}')`), /customer has invoices/);
  await db.query(`select public.delete_project('${disposableProject}')`);
  await db.query(`select public.delete_customer('${disposableCustomer}')`);
  assert.equal((await db.query(`select count(*)::int as count from public.projects where id = '${disposableProject}'`)).rows[0].count, 0);
  assert.equal((await db.query(`select count(*)::int as count from public.customers where id = '${disposableCustomer}'`)).rows[0].count, 0);

  const privileges = await db.query(`select
    has_table_privilege('authenticated', 'public.customers', 'delete') as can_delete_customers,
    has_table_privilege('authenticated', 'public.projects', 'delete') as can_delete_projects`);
  assert.deepEqual(privileges.rows[0], { can_delete_customers: false, can_delete_projects: false });
  await assert.rejects(db.query(`delete from auth.users where id = '${owner}'`), /foreign key constraint/);
  await assert.rejects(db.query(`select * from public.create_invoice(
    '${customer}', null, '2026-08-10', '2026-09-09', 0, '',
    '[{"description":"Gratis","quantity":1,"unit_price_rappen":0}]'::jsonb
  )`), /invoice total must be positive/);
  await db.close();
});

test("Reliability-Migration archiviert Alt-Rechnungen ohne erfundene Referenzen oder Snapshots", async () => {
  const db = await createMigrationDatabase();
  const owner = "10000000-0000-4000-8000-000000000031";
  const customer = "20000000-0000-4000-8000-000000000031";
  await db.exec(`
    insert into auth.users(id) values ('${owner}');
    select set_config('request.jwt.claim.sub', '${owner}', false);
    insert into public.customers(id, owner_id, company, email, address_line1, postal_code, city)
    values ('${customer}', '${owner}', 'Altbestand AG', 'alt@test.example', 'Altweg 1', '8000', 'Zürich');
    select public.create_invoice(
      '${customer}', null, 'ABCDEFGHIJKLMNOPQRSTU-X', '2025-12-01', '2025-12-31', 8.1, '',
      '[{"description":"Altleistung","quantity":1,"unit_price_rappen":10000}]'::jsonb
    );
    select public.create_invoice(
      '${customer}', null, 'ABCDEFGHIJKLMNOPQRSTU-Y', '2025-12-02', '2026-01-01', 8.1, '',
      '[{"description":"Altleistung 2","quantity":1,"unit_price_rappen":20000}]'::jsonb
    );
  `);
  await db.exec(await readFile(reliabilityMigrationPath, "utf8"));
  const migrated = await db.query(`select id, payment_reference, customer_snapshot, issuer_snapshot, is_legacy
    from public.invoices where owner_id = '${owner}'`);
  assert.equal(migrated.rows.length, 2);
  assert(migrated.rows.every((row) => row.payment_reference === null));
  assert(migrated.rows.every((row) => row.customer_snapshot === null && row.issuer_snapshot === null));
  assert(migrated.rows.every((row) => row.is_legacy === true));
  await assert.rejects(
    db.query(`select public.delete_draft_invoice('${migrated.rows[0].id}')`),
    /legacy invoice is archived/,
  );
  await assert.rejects(
    db.query(`select public.record_invoice_action('${migrated.rows[0].id}', 'downloaded', null, '{}'::jsonb)`),
    /legacy invoice is archived/,
  );
  await db.close();
});

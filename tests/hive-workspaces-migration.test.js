import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrations = [
  "20260803_heav_admin.sql",
  "20260804_restrict_signup.sql",
  "20260805_tighten_signup.sql",
  "20260806_optional_customer_details.sql",
  "20260810_portal_reliability.sql",
  "20260811_short_invoice_reference.sql",
  "20260812_invoice_project_snapshot.sql",
  "20260813_editable_portal_records.sql",
  "20260814_edit_legacy_invoice_records.sql",
  "20260819_customer_portal.sql",
  "20260820_customer_portal_invites.sql",
  "20260821_portal_request_actions.sql",
  "20260830_invoice_discounts_and_item_order.sql",
  "20260901_remote_history_marker.sql",
  "20260910_customer_offers.sql",
  "20260910153000_offer_email_events.sql",
  "20260916_studio_owner_authority_and_assistant.sql",
  "20260917_offer_send_reliability.sql",
  "20260918_departments_activity_log.sql",
  "20260919_invoice_reminders.sql",
  "20260920_email_log_and_templates.sql",
  "20260921_harden_email_audit.sql",
  "20261007_hive_workspaces.sql",
];

async function databaseBeforeHiveMigration() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role supabase_auth_admin;
    create schema auth;
    create table auth.users (id uuid primary key, email text unique);
    create schema storage;
    create table storage.objects (id uuid primary key, bucket_id text not null, name text not null);
    create table storage.buckets (id text primary key, public boolean not null default false);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `);

  const owner = "10000000-0000-4000-8000-000000000701";
  await db.exec(`
    insert into auth.users(id, email) values ('${owner}', 'admin@heav.ch');
    select set_config('request.jwt.claim.sub', '${owner}', false);
  `);

  for (const file of migrations) {
    if (file === "20261007_hive_workspaces.sql") break;
    if (file === "20260916_studio_owner_authority_and_assistant.sql") {
      await db.exec(`
        insert into public.company_settings(owner_id, company_name, owner_name, email, address_line1, postal_code, city, iban, vat_number)
        values ('${owner}', 'HEAV', 'Michias Tegegne', 'hello@heav.ch', 'Sternengasse 7', '4051', 'Basel', 'CH9300762011623852957', '');
      `);
    }
    const source = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
    await db.exec(source.replace("create extension if not exists pgcrypto;", ""));
  }
  return { db, owner };
}

async function applyHiveMigration(db) {
  const source = await readFile(new URL("../supabase/migrations/20261007_hive_workspaces.sql", import.meta.url), "utf8");
  await db.exec(source);
}

test("Hive migriert vorhandene CRM-Daten in getrennte Business-Workspaces", async () => {
  const { db, owner } = await databaseBeforeHiveMigration();
  const customer = "20000000-0000-4000-8000-000000000701";
  const project = "30000000-0000-4000-8000-000000000701";
  await db.exec(`
    insert into public.customers(id, owner_id, company, email, address_line1, postal_code, city)
    values ('${customer}', '${owner}', 'Bestehender Filmkunde AG', 'film@example.test', 'Testweg 1', '8000', 'Zürich');
    insert into public.projects(id, owner_id, customer_id, title)
    values ('${project}', '${owner}', '${customer}', 'Bestehende Filmproduktion');
  `);
  const legacyInvoice = (await db.query(`
    select * from public.create_invoice(
      '${customer}', '${project}', '2026-10-01', '2026-10-31', 0, '',
      '[{"description":"Bestehende Produktion","quantity":1,"unit_price_rappen":100000}]'::jsonb
    )
  `)).rows[0];

  await applyHiveMigration(db);

  const workspaces = await db.query(`select id, name, slug from public.workspaces order by created_at, name`);
  assert.deepEqual(workspaces.rows.map((row) => row.name).sort(), ["Hive", "Michias Tegegne", "Wedding Vocals"]);
  const photoWorkspace = workspaces.rows.find((row) => row.slug === "michias-tegegne");
  const weddingWorkspace = workspaces.rows.find((row) => row.slug === "wedding-vocals");
  const hiveWorkspace = workspaces.rows.find((row) => row.slug === "hive");
  assert.ok(photoWorkspace?.id && weddingWorkspace?.id && hiveWorkspace?.id);

  const settings = await db.query(`
    select workspace_id, business_name, invoice_prefix, currency
    from public.workspace_settings
    order by business_name
  `);
  assert.deepEqual(settings.rows.map((row) => row.business_name), ["Hive", "Michias Tegegne", "Wedding Vocals"]);
  assert.deepEqual(settings.rows.map((row) => [row.business_name, row.invoice_prefix, row.currency]), [
    ["Hive", "HIVE", "CHF"],
    ["Michias Tegegne", "MT", "CHF"],
    ["Wedding Vocals", "WV", "CHF"],
  ]);

  const migrated = await db.query(`
    select customer.workspace_id as customer_workspace, project.workspace_id as project_workspace, invoice.workspace_id as invoice_workspace
    from public.customers customer
    join public.projects project on project.id = '${project}'
    join public.invoices invoice on invoice.id = '${legacyInvoice.invoice_id}'
    where customer.id = '${customer}'
  `);
  assert.deepEqual(migrated.rows[0], {
    customer_workspace: photoWorkspace.id,
    project_workspace: photoWorkspace.id,
    invoice_workspace: photoWorkspace.id,
  });

  const weddingCustomer = "20000000-0000-4000-8000-000000000702";
  await db.exec(`
    insert into public.customers(id, workspace_id, company, email, address_line1, postal_code, city)
    values ('${weddingCustomer}', '${weddingWorkspace.id}', 'Hochzeit Keller', 'wedding@example.test', 'Musikweg 3', '3000', 'Bern');
    insert into public.products(workspace_id, name, unit_price_rappen, tax_rate)
    values ('${weddingWorkspace.id}', 'Trauung', 120000, 0), ('${photoWorkspace.id}', 'Videoproduktion', 280000, 0);
  `);
  const weddingInvoice = (await db.query(`
    select * from public.create_invoice(
      '${weddingCustomer}', null, '2026-10-02', '2026-10-16', 0, '',
      '[{"description":"Trauung","quantity":1,"unit_price_rappen":120000}]'::jsonb
    )
  `)).rows[0];
  assert.equal(weddingInvoice.invoice_number, "WV-2026-001");
  assert.equal((await db.query(`select workspace_id from public.invoices where id = '${weddingInvoice.invoice_id}'`)).rows[0].workspace_id, weddingWorkspace.id);

  const photoInvoice = (await db.query(`
    select * from public.create_invoice(
      '${customer}', null, '2026-10-02', '2026-10-16', 0, '',
      '[{"description":"Videoproduktion","quantity":1,"unit_price_rappen":120000}]'::jsonb
    )
  `)).rows[0];
  assert.equal(photoInvoice.invoice_number, "MT-2026-002");

  const products = await db.query(`select workspace_id, name from public.products order by name`);
  assert.deepEqual(products.rows, [
    { workspace_id: weddingWorkspace.id, name: "Trauung" },
    { workspace_id: photoWorkspace.id, name: "Videoproduktion" },
  ]);

  await assert.rejects(
    db.query(`
      insert into public.projects(workspace_id, customer_id, title)
      values ('${weddingWorkspace.id}', '${customer}', 'Unzulässige Querverbindung')
    `),
    /workspace customer mismatch/i,
  );

  const memberships = await db.query(`
    select workspace_id, role
    from public.workspace_memberships
    where user_id = '${owner}'
    order by workspace_id
  `);
  assert.equal(memberships.rows.length, 3);
  assert.equal(memberships.rows.every((row) => row.role === "owner"), true);
  await db.close();
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const adminMigrationPath = new URL("../supabase/migrations/20260803_heav_admin.sql", import.meta.url);
const optionalCustomerMigrationPath = new URL("../supabase/migrations/20260806_optional_customer_details.sql", import.meta.url);
const portalMigrationPath = new URL("../supabase/migrations/20260819_customer_portal.sql", import.meta.url);
const invitationMigrationPath = new URL("../supabase/migrations/20260820_customer_portal_invites.sql", import.meta.url);
const requestActionMigrationPath = new URL("../supabase/migrations/20260821_portal_request_actions.sql", import.meta.url);
const offerMigrationPath = new URL("../supabase/migrations/20260910_customer_offers.sql", import.meta.url);
const offerEventsMigrationPath = new URL("../supabase/migrations/20260910153000_offer_email_events.sql", import.meta.url);
const reliabilityMigrationPath = new URL("../supabase/migrations/20260917_offer_send_reliability.sql", import.meta.url);

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
  await db.exec(`${adminMigration}\n${await readFile(optionalCustomerMigrationPath, "utf8")}\n${await readFile(portalMigrationPath, "utf8")}\n${await readFile(invitationMigrationPath, "utf8")}\n${await readFile(requestActionMigrationPath, "utf8")}\n${await readFile(offerMigrationPath, "utf8")}\n${await readFile(offerEventsMigrationPath, "utf8")}\ncreate function public.is_studio_owner() returns boolean language sql stable as $$ select true $$;\n${await readFile(reliabilityMigrationPath, "utf8")}`);
  return db;
}

test("Offertenversand behält bei Fehlern denselben Provider-Key und schreibt genau ein Audit-Event", async () => {
  const db = await createDatabase();
  const owner = "10000000-0000-4000-8000-000000000001";
  const customer = "20000000-0000-4000-8000-000000000001";
  const requestKey = "30000000-0000-4000-8000-000000000001";
  await db.exec(`
    insert into auth.users(id) values ('${owner}');
    select set_config('request.jwt.claim.sub', '${owner}', false);
    insert into public.customers(id, owner_id, company, email, address_line1, postal_code, city)
      values ('${customer}', '${owner}', 'Retry AG', 'retry@example.test', 'Testweg 1', '8000', 'Zürich');
    select public.create_offer('${customer}', null, 'Retry-Test', '2026-09-17', '2099-12-31', 8.1, '', 'Diese Offerte ist ein belastbarer Retry-Test.', '[{"description":"Produktion","quantity":1,"unit_price_rappen":10000}]'::jsonb);
  `);
  const offer = await db.query("select id from public.offers limit 1");
  const offerId = offer.rows[0].id;
  await db.query(`select public.share_customer_offer('${offerId}')`);

  const first = (await db.query(`select * from public.reserve_offer_send('${offerId}', '${requestKey}')`)).rows[0];
  const duplicate = (await db.query(`select * from public.reserve_offer_send('${offerId}', '${requestKey}')`)).rows[0];
  assert.equal(first.state, "pending");
  assert.equal(duplicate.attempt_id, first.attempt_id);
  assert.equal(duplicate.idempotency_key, first.idempotency_key);

  await db.query(`select public.complete_offer_send('${first.attempt_id}', false, null, 'retry@example.test', '{"provider_error":"temporary"}'::jsonb)`);
  const retry = (await db.query(`select * from public.reserve_offer_send('${offerId}', '${requestKey}')`)).rows[0];
  assert.equal(retry.attempt_id, first.attempt_id);
  assert.equal(retry.idempotency_key, first.idempotency_key);
  assert.equal(retry.state, "pending");

  await db.query(`select public.complete_offer_send('${retry.attempt_id}', true, 'resend-test-1', 'retry@example.test', '{"resend_id":"resend-test-1"}'::jsonb)`);
  const replay = (await db.query(`select * from public.reserve_offer_send('${offerId}', '${requestKey}')`)).rows[0];
  assert.equal(replay.state, "sent");
  assert.equal(replay.provider_id, "resend-test-1");

  const events = await db.query("select kind, details->>'resend_id' as resend_id from public.offer_events where kind = 'emailed'");
  assert.deepEqual(events.rows, [{ kind: "emailed", resend_id: "resend-test-1" }]);
  await db.close();
});

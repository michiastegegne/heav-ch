import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../supabase/migrations/20261016_zzzzzz_department_document_wrapper_guards.sql",
  import.meta.url,
);

async function makeDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create type public.workspace_role as enum ('owner','admin','member','accountant');

    create table public.customers(
      id uuid primary key,
      workspace_id uuid not null
    );
    create table public.customer_departments(
      id uuid primary key,
      customer_id uuid not null,
      workspace_id uuid not null,
      active boolean not null default true
    );
    create table public.invoices(
      id uuid primary key,
      workspace_id uuid not null,
      department_id uuid
    );
    create table public.offers(
      id uuid primary key,
      workspace_id uuid not null,
      department_id uuid
    );
    create table public.activity_events(
      id uuid primary key default gen_random_uuid(),
      entity_id uuid not null,
      workspace_id uuid not null,
      event_type text not null,
      department_id uuid
    );

    create function public.is_workspace_member(
      p_workspace_id uuid,
      p_required public.workspace_role default 'member'
    )
    returns boolean
    language sql
    stable
    as $$
      select p_workspace_id::text =
        nullif(current_setting('test.workspace_id', true), '')
    $$;

    create function public.create_invoice(
      p_customer_id uuid,
      p_project_id uuid,
      p_issue_date date,
      p_due_date date,
      p_tax_rate numeric,
      p_notes text,
      p_items jsonb
    )
    returns table(invoice_id uuid, invoice_number text, payment_reference text)
    language plpgsql
    as $$
    declare
      v_workspace uuid;
      v_id uuid := gen_random_uuid();
    begin
      select workspace_id into v_workspace
      from public.customers where id = p_customer_id;
      insert into public.invoices(id, workspace_id)
      values (v_id, v_workspace);
      insert into public.activity_events(entity_id, workspace_id, event_type)
      values (v_id, v_workspace, 'invoice.created');
      return query select v_id, 'TEST-I', 'RFTEST';
    end;
    $$;

    create function public.create_offer(
      p_customer_id uuid,
      p_project_id uuid,
      p_title text,
      p_issue_date date,
      p_valid_until date,
      p_tax_rate numeric,
      p_notes text,
      p_terms text,
      p_items jsonb
    )
    returns table(offer_id uuid, offer_number text)
    language plpgsql
    as $$
    declare
      v_workspace uuid;
      v_id uuid := gen_random_uuid();
    begin
      select workspace_id into v_workspace
      from public.customers where id = p_customer_id;
      insert into public.offers(id, workspace_id)
      values (v_id, v_workspace);
      insert into public.activity_events(entity_id, workspace_id, event_type)
      values (v_id, v_workspace, 'offer.created');
      return query select v_id, 'TEST-O';
    end;
    $$;
  `);

  await db.exec(await readFile(migrationUrl, "utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261016135329_department_wrapper_result_ids.sql", import.meta.url), "utf8"));
  return db;
}

const a = "10000000-0000-4000-8000-0000000000a1";
const b = "10000000-0000-4000-8000-0000000000b1";
const customerA = "20000000-0000-4000-8000-0000000000a1";
const deptA = "30000000-0000-4000-8000-0000000000a1";
const deptB = "30000000-0000-4000-8000-0000000000b1";

async function seed(db) {
  await db.exec(`
    insert into public.customers(id, workspace_id)
    values ('${customerA}', '${a}');

    insert into public.customer_departments(
      id, customer_id, workspace_id, active
    ) values
      ('${deptA}', '${customerA}', '${a}', true),
      ('${deptB}', '20000000-0000-4000-8000-0000000000b1', '${b}', true);

    insert into public.customers(id, workspace_id)
    values ('20000000-0000-4000-8000-0000000000b1', '${b}');

    select set_config('test.workspace_id', '${a}', false);
  `);
}

test("department wrappers accept only a department of the selected customer/workspace", async () => {
  const db = await makeDb();
  await seed(db);

  const invoice = await db.query(
    `select * from public.create_invoice_in_department(
      $1, null, '2026-10-16', '2026-11-16', 0, '',
      '[{"description":"Produktion","quantity":1,"unit_price_rappen":10000}]'::jsonb,
      $2
    )`,
    [customerA, deptA],
  );
  assert.equal(
    (await db.query("select department_id from public.invoices where id=$1", [invoice.rows[0].invoice_id])).rows[0].department_id,
    deptA,
  );

  const offer = await db.query(
    `select * from public.create_offer_in_department(
      $1, null, 'Produktion', '2026-10-16', '2026-11-16', 0, '',
      'Mit der Annahme verbindlich und bestätigt.',
      '[{"description":"Produktion","quantity":1,"unit_price_rappen":10000}]'::jsonb,
      $2
    )`,
    [customerA, deptA],
  );
  assert.equal(
    (await db.query("select department_id from public.offers where id=$1", [offer.rows[0].offer_id])).rows[0].department_id,
    deptA,
  );

  await assert.rejects(
    db.query(
      `select * from public.create_invoice_in_department(
        $1, null, '2026-10-16', '2026-11-16', 0, '',
        '[{"description":"Produktion","quantity":1,"unit_price_rappen":10000}]'::jsonb,
        $2
      )`,
      [customerA, deptB],
    ),
    /department workspace mismatch/i,
  );

  await assert.rejects(
    db.query(
      `select * from public.create_offer_in_department(
        $1, null, 'Produktion', '2026-10-16', '2026-11-16', 0, '',
        'Mit der Annahme verbindlich und bestätigt.',
        '[{"description":"Produktion","quantity":1,"unit_price_rappen":10000}]'::jsonb,
        $2
      )`,
      [customerA, deptB],
    ),
    /department workspace mismatch/i,
  );

  await db.close();
});

test("department wrappers reject an actor without accountant access to the customer workspace", async () => {
  const db = await makeDb();
  await seed(db);
  await db.exec(`select set_config('test.workspace_id', '${b}', false);`);

  await assert.rejects(
    db.query(
      `select * from public.create_invoice_in_department(
        $1, null, '2026-10-16', '2026-11-16', 0, '',
        '[{"description":"Produktion","quantity":1,"unit_price_rappen":10000}]'::jsonb,
        $2
      )`,
      [customerA, deptA],
    ),
    /workspace accountant access required/i,
  );

  await assert.rejects(
    db.query(
      `select * from public.create_offer_in_department(
        $1, null, 'Produktion', '2026-10-16', '2026-11-16', 0, '',
        'Mit der Annahme verbindlich und bestätigt.',
        '[{"description":"Produktion","quantity":1,"unit_price_rappen":10000}]'::jsonb,
        $2
      )`,
      [customerA, deptA],
    ),
    /workspace accountant access required/i,
  );

  await db.close();
});

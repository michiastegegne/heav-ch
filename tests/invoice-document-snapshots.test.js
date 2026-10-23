import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20261016_zzzzz_invoice_document_snapshots.sql",
  import.meta.url,
);
const functionUrl = new URL(
  "../supabase/functions/invoice-document/index.ts",
  import.meta.url,
);

test("invoice document metadata is private, versioned and immutable", async () => {
  const source = await readFile(migrationUrl, "utf8");

  assert.match(source, /create table if not exists public\.invoice_documents/);
  assert.match(source, /unique\(invoice_id, version\)/);
  assert.match(source, /alter table public\.invoice_documents enable row level security/);
  assert.match(source, /prevent_invoice_document_mutation/);
  assert.match(source, /before update or delete on public\.invoice_documents/);
  assert.match(source, /storage_bucket = 'invoice-documents'/);
  assert.match(source, /do update set public = false/);
});

test("only finalized non-legacy invoices can register persisted PDFs", async () => {
  const source = await readFile(migrationUrl, "utf8");

  assert.match(source, /invoice\.number_finalized/);
  assert.match(source, /invoice\.is_legacy/);
  assert.match(source, /if not v_finalized or v_legacy then/);
  assert.match(source, /invoice document requires a finalized non-legacy invoice/);
  assert.match(source, /invoice document storage path mismatch/);
});

test("invoice edge function reuses persisted bytes for downloads and email attachments", async () => {
  const source = await readFile(functionUrl, "utf8");

  assert.match(source, /persistOrLoadInvoicePdf/);
  assert.match(source, /invoice_documents/);
  assert.match(source, /sha256Hex/);
  assert.match(source, /upsert: false/);
  assert.match(source, /verifiedPersistedInvoicePdf/);
  assert.match(source, /persistedDocument\.filename/);

  const actionBlock = source.match(
    /const persistedDocument = await persistOrLoadInvoicePdf[\s\S]*?await assertWorkspaceEmailAllowed/,
  )?.[0] || "";
  assert.match(actionBlock, /const pdfBytes = persistedDocument\.bytes/);
  assert.doesNotMatch(actionBlock, /createInvoicePdf/);
});

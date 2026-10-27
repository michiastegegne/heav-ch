import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routeUrl = new URL(
  "../hive-next/app/api/hive/invoices/[id]/action/route.ts",
  import.meta.url,
);
const studioUrl = new URL(
  "../hive-next/app/studio/page.tsx",
  import.meta.url,
);

test("invoice send API requires the durable browser request key instead of inventing a new one", async () => {
  const source = await readFile(routeUrl, "utf8");

  assert.match(source, /action:\s*z\.literal\('send'\), requestKey:\s*z\.string\(\)\.uuid\(\)/);
  assert.match(source, /payload\.requestKey = input\.requestKey/);
  assert.doesNotMatch(source, /payload\.requestKey = crypto\.randomUUID\(\)/);
});

test("invoice send UI retains the same key through failures and clears it only after success", async () => {
  const source = await readFile(studioUrl, "utf8");

  assert.match(source, /hive\.invoiceSendRequest/);
  assert.match(source, /invoiceSendBusyIds/);
  assert.match(source, /sessionStorage\.setItem\(invoiceSendStorageKey/);
  assert.match(source, /sessionStorage\.removeItem\(invoiceSendStorageKey/);
  assert.match(source, /denselben sicheren Versandauftrag/);
});

test("invoice provider response loss is explicitly retryable and does not complete the pending send", async () => {
  const source = await readFile(
    new URL("../supabase/functions/invoice-document/index.ts", import.meta.url),
    "utf8",
  );

  const catchBlock = source.match(
    /catch \(sendError\) \{[\s\S]*?deliveryUncertain:[\s\S]*?retryable:[\s\S]*?\n      \}/,
  )?.[0] ?? "";

  assert.match(catchBlock, /deliveryUncertain:\s*true/);
  assert.match(catchBlock, /retryable:\s*true/);
  assert.match(catchBlock, /status:\s*502/);
  assert.match(catchBlock, /derselbe sichere Versandauftrag/);
  assert.doesNotMatch(catchBlock, /complete_invoice_send/);
});

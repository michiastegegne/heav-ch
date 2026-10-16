import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const configUrl = new URL("../supabase/config.toml", import.meta.url);
const invoiceUrl = new URL("../supabase/functions/invoice-document/index.ts", import.meta.url);
const offerUrl = new URL("../supabase/functions/offer-send/index.ts", import.meta.url);

test("Clerk-facing financial Edge Functions use handler-level bearer validation", async () => {
  const [config, invoice, offer] = await Promise.all([
    readFile(configUrl, "utf8"),
    readFile(invoiceUrl, "utf8"),
    readFile(offerUrl, "utf8"),
  ]);

  assert.match(config, /\[functions\.invoice-document\][\s\S]*?verify_jwt = false/);
  assert.match(config, /\[functions\.offer-send\][\s\S]*?verify_jwt = false/);

  for (const source of [invoice, offer]) {
    assert.match(source, /Authorization|authorization/);
    assert.match(source, /current_app_user_id/);
    assert.match(source, /is_workspace_member/);
  }

  // Other authenticated functions are not globally weakened as part of this cutover.
  assert.match(config, /\[functions\.assistant-chat\][\s\S]*?verify_jwt = true/);
  assert.match(config, /\[functions\.portal-send-invite\][\s\S]*?verify_jwt = true/);
});

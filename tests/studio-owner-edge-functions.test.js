import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const functions = ["invoice-document", "offer-send", "portal-send-invite", "assistant-chat"];

for (const name of functions) {
  test(`${name} prüft die unveränderliche Studio-Owner-Berechtigung`, async () => {
    const source = await readFile(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), "utf8");
    assert.match(source, /rpc\(\s*["']is_studio_owner["']/);
    assert.match(source, /Studio-Zugriff erforderlich/);
  });
}

test("Studio boot resolves owner authority through the immutable RPC", async () => {
  const source = await readFile(new URL("../admin/assets/app.js", import.meta.url), "utf8");
  assert.match(source, /rpc\("is_studio_owner"\)/);
  assert.doesNotMatch(source, /const isOwner = settings\?\.owner_id === userId/);
});

test("Login resolves owner authority through the immutable RPC", async () => {
  const source = await readFile(new URL("../login/assets/login.js", import.meta.url), "utf8");
  assert.match(source, /rpc\("is_studio_owner"\)/);
  assert.doesNotMatch(source, /settings\?\.owner_id === user\.id/);
});

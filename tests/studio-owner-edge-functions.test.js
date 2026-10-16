import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ownerOnlyFunctions = ["assistant-chat"];

for (const name of ownerOnlyFunctions) {
  test(`${name} prüft die unveränderliche Studio-Owner-Berechtigung`, async () => {
    const source = await readFile(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), "utf8");
    assert.match(source, /rpc\(\s*["']is_studio_owner["']/);
    assert.match(source, /Studio-Zugriff erforderlich/);
  });
}

test("portal-send-invite nutzt die Clerk-kompatible Identitäts- und Workspace-Berechtigung", async () => {
  const source = await readFile(new URL("../supabase/functions/portal-send-invite/index.ts", import.meta.url), "utf8");
  assert.match(source, /rpc\(\s*["']current_app_user_id["']/);
  assert.match(source, /rpc\(\s*["']is_workspace_member["']/);
  assert.match(source, /p_required:\s*["']admin["']/);
  assert.doesNotMatch(source, /auth\s*\.\s*getUser\(/);
  assert.doesNotMatch(source, /rpc\(\s*["']is_studio_owner["']/);
});

test("offer-send nutzt die Clerk-kompatible Identitäts- und Workspace-Berechtigung", async () => {
  const source = await readFile(new URL("../supabase/functions/offer-send/index.ts", import.meta.url), "utf8");
  assert.match(source, /rpc\(\s*["']current_app_user_id["']/);
  assert.match(source, /rpc\(\s*["']is_workspace_member["']/);
  assert.match(source, /p_required:\s*["']accountant["']/);
  assert.doesNotMatch(source, /auth\s*\.\s*getUser\(/);
  assert.doesNotMatch(source, /rpc\(\s*["']is_studio_owner["']/);
});

test("invoice-document nutzt die Clerk-kompatible Identitäts- und Workspace-Berechtigung", async () => {
  const source = await readFile(new URL("../supabase/functions/invoice-document/index.ts", import.meta.url), "utf8");
  assert.match(source, /rpc\(\s*["']current_app_user_id["']/);
  assert.match(source, /rpc\(\s*["']is_workspace_member["']/);
  assert.match(source, /p_required:\s*["']accountant["']/);
  assert.doesNotMatch(source, /auth\s*\.\s*getUser\(/);
  assert.doesNotMatch(source, /rpc\(\s*["']is_studio_owner["']/);
});

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

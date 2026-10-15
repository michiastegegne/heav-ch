import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Portal-Einladungen sind workspace-autorisiert und erzeugen eine Mitgliedschaft", async () => {
  const source = await readFile(new URL("../supabase/functions/portal-send-invite/index.ts", import.meta.url), "utf8");
  assert.match(source, /Authorization/);
  assert.match(source, /rpc\("current_app_user_id"\)/);
  assert.match(source, /rpc\("is_workspace_member"/);
  assert.match(source, /p_required:\s*"admin"/);
  assert.match(source, /workspace_id/);
  assert.match(source, /inviteUserByEmail/);
  assert.match(source, /customer_portal_memberships/);
  assert.match(source, /customer_portal_invites/);
  assert.match(source, /deleteUser/);
  assert.match(source, /https:\/\/heav\.ch\/login\//);
  assert.doesNotMatch(source, /auth\.getUser/);
  assert.doesNotMatch(source, /temporary password/i);
});

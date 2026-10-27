import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20261015_clerk_identity_bridge.sql",
  import.meta.url,
);

test("Clerk bridge preserves legacy UUID ownership and resolves third-party sub claims explicitly", async () => {
  const source = await readFile(migrationUrl, "utf8");

  assert.match(source, /create table if not exists public\.external_auth_identities/);
  assert.match(source, /legacy_user_id uuid not null references auth\.users\(id\)/);
  assert.match(source, /v_subject text := nullif\(v_claims ->> 'sub', ''\)/);
  assert.match(source, /identity\.issuer = v_issuer/);
  assert.match(source, /identity\.subject = v_subject/);
  assert.match(source, /membership\.user_id = public\.current_app_user_id\(\)/);
});

test("Clerk bridge enables RLS for customer departments with workspace and portal policies", async () => {
  const source = await readFile(migrationUrl, "utf8");

  assert.match(source, /alter table public\.customer_departments enable row level security/);
  assert.match(source, /create policy "workspace members manage customer departments"/);
  assert.match(source, /public\.is_workspace_member\(workspace_id, 'member'\)/);
  assert.match(source, /membership\.user_id = public\.current_app_user_id\(\)/);
});

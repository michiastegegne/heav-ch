import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const bridgeUrl = new URL(
  "../supabase/migrations/20261015_clerk_identity_bridge.sql",
  import.meta.url,
);

test("customer_departments RLS is explicitly enabled during Clerk bridge migration", async () => {
  const source = await readFile(bridgeUrl, "utf8");

  assert.match(source, /alter table public\.customer_departments enable row level security/i);
  assert.match(source, /drop policy if exists "owner manages customer departments"/i);
  assert.match(source, /create policy "workspace members manage customer departments"/i);
  assert.match(source, /is_workspace_member\(workspace_id, 'member'\)/i);
});

test("customer department member reads resolve through the internal Hive identity", async () => {
  const source = await readFile(bridgeUrl, "utf8");

  assert.match(source, /create policy "member reads own customer departments"/i);
  assert.match(source, /membership\.user_id = public\.current_app_user_id\(\)/i);
  assert.doesNotMatch(
    source.match(/create policy "member reads own customer departments"[\s\S]*?\);/i)?.[0] || "",
    /auth\.uid\(\)/i,
  );
});

test("workspace membership helper uses current_app_user_id instead of raw Clerk subject", async () => {
  const source = await readFile(bridgeUrl, "utf8");

  const helper = source.match(
    /create or replace function public\.is_workspace_member[\s\S]*?\$\$;/i,
  )?.[0] || "";

  assert.match(helper, /membership\.user_id = public\.current_app_user_id\(\)/i);
  assert.doesNotMatch(helper, /membership\.user_id = auth\.uid\(\)/i);
});

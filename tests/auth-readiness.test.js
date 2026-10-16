import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routeUrl = new URL(
  "../hive-next/app/api/auth/readiness/route.ts",
  import.meta.url,
);

test("auth readiness endpoint is passive and never calls mutating identity RPCs", async () => {
  const source = await readFile(routeUrl, "utf8");

  assert.match(source, /getHiveAuthState/);
  assert.match(source, /HIVE_IDENTITY_MIGRATION_ENABLED/);
  assert.doesNotMatch(source, /create_external_identity_link_token/);
  assert.doesNotMatch(source, /claim_external_identity_link_token/);
  assert.doesNotMatch(source, /\.rpc\(/);
  assert.doesNotMatch(source, /method:\s*['"]POST['"]/);
});

test("auth readiness exposes booleans only, never secret environment values", async () => {
  const source = await readFile(routeUrl, "utf8");

  assert.match(source, /clerkConfigured/);
  assert.match(source, /clerkBridgeEnabled/);
  assert.match(source, /supabaseConfigured/);
  assert.doesNotMatch(source, /CLERK_SECRET_KEY[^\n]*:/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_SUPABASE_ANON_KEY[^\n]*:/);
});

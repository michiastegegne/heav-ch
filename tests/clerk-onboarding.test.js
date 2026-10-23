import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20261016_zzz_clerk_account_onboarding.sql",
  import.meta.url,
);
const routeUrl = new URL(
  "../hive-next/app/api/auth/onboarding/route.ts",
  import.meta.url,
);
const cardUrl = new URL(
  "../hive-next/app/account/identity-link-card.tsx",
  import.meta.url,
);

test("new Clerk onboarding is atomic and preserves the app-user identity boundary", async () => {
  const source = await readFile(migrationUrl, "utf8");

  assert.match(source, /provision_current_hive_account/);
  assert.match(source, /public\.provision_current_app_user/);
  assert.match(source, /public\.create_hive_preview_workspace/);
  assert.match(source, /existing Hive account must be linked, not provisioned/);
  assert.match(source, /legacy_auth_user/);
  assert.match(source, /return query select v_user, v_workspace/);
  assert.doesNotMatch(source, /service_role/i);
  assert.doesNotMatch(source, /where[^;]+lower\([^;]*email/is);
});

test("Clerk onboarding endpoint verifies the server-side Clerk session and same-origin request", async () => {
  const source = await readFile(routeUrl, "utf8");

  assert.match(source, /sameOrigin\(request\)/);
  assert.match(source, /const \{ userId \} = await auth\(\)/);
  assert.match(source, /currentUser\(\)/);
  assert.match(source, /verification\?\.status === 'verified'/);
  assert.match(source, /createClerkSupabaseServerClient/);
  assert.match(source, /provision_current_hive_account/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE/i);
});

test("account UI makes legacy linking and new-account creation explicit choices", async () => {
  const source = await readFile(cardUrl, "utf8");

  assert.match(source, /Bestehende Daten/);
  assert.match(source, /Neu starten/);
  assert.match(source, /Bestehenden Account verbinden/);
  assert.match(source, /Neuen Hive-Account starten/);
  assert.match(source, /\/api\/auth\/onboarding/);
});

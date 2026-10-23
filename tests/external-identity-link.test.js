import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20261016_external_identity_link_tokens.sql",
  import.meta.url,
);
const routeUrl = new URL(
  "../hive-next/app/api/auth/identity-link/route.ts",
  import.meta.url,
);

test("identity linking requires a trusted issuer and never trusts email matching", async () => {
  const source = await readFile(migrationUrl, "utf8");

  assert.match(source, /trusted_external_auth_issuers/);
  assert.match(source, /trusted\.issuer = v_issuer/);
  assert.match(source, /trusted\.active/);
  assert.doesNotMatch(source, /auth\.users[^\n]+email/i);
  assert.doesNotMatch(source, /lower\([^\n]*email/i);
});

test("legacy users mint short-lived one-time codes and Clerk redeems them once", async () => {
  const source = await readFile(migrationUrl, "utf8");

  assert.match(source, /interval '15 minutes'/);
  assert.match(source, /legacy Supabase session required/);
  assert.match(source, /used_at is null/);
  assert.match(source, /link\.expires_at > now\(\)/);
  assert.match(source, /set used_at = now\(\)/);
  assert.match(source, /extensions\.digest\(p_token, 'sha256'\)/);
});

test("identity claims cannot move an already-linked Clerk identity to another account", async () => {
  const source = await readFile(migrationUrl, "utf8");

  assert.match(source, /v_existing is not null and v_existing <> v_legacy/);
  assert.match(source, /identity is already linked to another account/);
});

test("identity link endpoint checks provider sessions server-side", async () => {
  const source = await readFile(routeUrl, "utf8");

  assert.match(source, /createSessionSupabaseClient/);
  assert.match(source, /const \{ userId \} = await auth\(\)/);
  assert.match(source, /claim_external_identity_link_token/);
  assert.match(source, /create_external_identity_link_token/);
  assert.match(source, /sameOrigin\(request\)/);
});

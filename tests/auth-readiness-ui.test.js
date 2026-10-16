import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cardUrl = new URL(
  "../hive-next/app/account/auth-readiness-card.tsx",
  import.meta.url,
);

test("cutover card is passive and treats not-ready as status, not mutation", async () => {
  const source = await readFile(cardUrl, "utf8");

  assert.match(source, /\/api\/auth\/readiness/);
  assert.match(source, /response\.status!==503/);
  assert.match(source, /clerkCutoverReady/);
  assert.match(source, /Clerk bleibt sicher gesperrt/);
  assert.doesNotMatch(source, /method:\s*['"]POST['"]/);
  assert.doesNotMatch(source, /CLERK_SECRET_KEY/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE/);
});

test("cutover card exposes only readiness labels, never credential values", async () => {
  const source = await readFile(cardUrl, "utf8");

  for (const label of [
    "Clerk verbunden",
    "Supabase DB verbunden",
    "Identity-Bridge freigegeben",
    "Identity-Migration freigegeben",
  ]) {
    assert.match(source, new RegExp(label));
  }
  assert.doesNotMatch(source, /publishable_key|secret_key|anon_key/i);
});

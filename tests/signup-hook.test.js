import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrationPath = new URL("../supabase/migrations/20260804_restrict_signup.sql", import.meta.url);
const tightenMigrationPath = new URL("../supabase/migrations/20260805_tighten_signup.sql", import.meta.url);
let sql = "";
let tightenSql = "";
try {
  sql = await readFile(migrationPath, "utf8");
  tightenSql = await readFile(tightenMigrationPath, "utf8");
} catch {
  // The RED phase intentionally runs before the migration exists.
}

test("Before-user-created hook erlaubt nur bestätigbare HEAV-Mailadressen", async () => {
  assert.match(sql, /hook_restrict_heav_signup/);
  const db = new PGlite();
  await db.exec("create role supabase_auth_admin; create role anon; create role authenticated;");
  await db.exec(sql);
  await db.exec(tightenSql);

  const allowed = await db.query(
    `select public.hook_restrict_heav_signup('{"user":{"email":"admin@heav.ch"}}'::jsonb) as result`,
  );
  assert.deepEqual(allowed.rows[0].result, {});

  const denied = await db.query(
    `select public.hook_restrict_heav_signup('{"user":{"email":"person@example.com"}}'::jsonb) as result`,
  );
  assert.equal(denied.rows[0].result.error.http_code, 403);
  assert.match(denied.rows[0].result.error.message, /HEAV/i);

  const otherHeavMailbox = await db.query(
    `select public.hook_restrict_heav_signup('{"user":{"email":"staff@heav.ch"}}'::jsonb) as result`,
  );
  assert.equal(otherHeavMailbox.rows[0].result.error.http_code, 403);

  const anonymousPrivilege = await db.query(
    `select has_function_privilege('anon', 'public.hook_restrict_heav_signup(jsonb)', 'execute') as allowed`,
  );
  assert.equal(anonymousPrivilege.rows[0].allowed, false);
  await db.close();
});

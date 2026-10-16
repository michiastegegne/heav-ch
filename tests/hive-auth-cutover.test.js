import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const providerUrl = new URL("../hive-next/lib/hive/auth-provider.ts", import.meta.url);
const middlewareUrl = new URL("../hive-next/middleware.ts", import.meta.url);
const accessUrl = new URL("../hive-next/lib/hive/access.ts", import.meta.url);

test("Hive auth cutover requires an explicit provider and a ready Clerk bridge", async () => {
  const source = await readFile(providerUrl, "utf8");

  assert.match(source, /HIVE_AUTH_PROVIDER/);
  assert.match(source, /HIVE_CLERK_DB_BRIDGE_ENABLED/);
  assert.match(source, /clerk_keys_missing/);
  assert.match(source, /clerk_bridge_disabled/);
  assert.match(source, /requested === 'clerk' && state\.ready/);
});

test("incomplete Clerk setup fails closed in middleware and data access", async () => {
  const middleware = await readFile(middlewareUrl, "utf8");
  const access = await readFile(accessUrl, "utf8");

  assert.match(middleware, /if \(!authState\.ready\)/);
  assert.match(middleware, /status: 503/);
  assert.match(access, /if \(!authState\.ready\)/);
  assert.match(access, /HiveAccessError\(503/);
});

test("Clerk mode never falls back to the legacy password session route", async () => {
  const session = await readFile(
    new URL("../hive-next/app/api/auth/session/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(session, /authState\.requested === 'clerk'/);
  assert.match(session, /Bitte verwende die aktive Anmeldung/);
});

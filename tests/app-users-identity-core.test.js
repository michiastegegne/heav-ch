import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20261016_zz_app_users_identity_core.sql",
  import.meta.url,
);

test("app_users preserves every legacy Supabase UUID one-to-one", async () => {
  const source = await readFile(migrationUrl, "utf8");

  assert.match(source, /create table if not exists public\.app_users/);
  assert.match(source, /select\s+account\.id,/s);
  assert.match(source, /from auth\.users account/);
  assert.match(source, /on conflict \(id\) do update/);
});

test("public foreign keys are staged away from auth.users without rewriting UUID values", async () => {
  const source = await readFile(migrationUrl, "utf8");

  assert.match(source, /target_namespace\.nspname = 'auth'/);
  assert.match(source, /target_table\.relname = 'users'/);
  assert.match(source, /source_namespace\.nspname = 'public'/);
  assert.match(source, /references public\.app_users\(id\)/);
  assert.doesNotMatch(source, /update\s+public\.workspace_memberships\s+set\s+user_id/i);
});

test("new third-party identities can provision an internal UUID without auth.users", async () => {
  const source = await readFile(migrationUrl, "utf8");

  assert.match(source, /create or replace function public\.provision_current_app_user/);
  assert.match(source, /trusted_external_auth_issuers/);
  assert.match(source, /insert into public\.app_users/);
  assert.match(source, /legacy_auth_user\s*\n?\s*\)\s*\n?\s*values/s);
  assert.match(source, /legacy_user_id,\s*\n\s*app_user_id/s);
  assert.match(source, /null,\s*\n\s*v_user/s);
});

test("caller-supplied profile email is not treated as verified authorization data", async () => {
  const source = await readFile(migrationUrl, "utf8");

  assert.match(source, /email_verified boolean not null default false/);
  assert.match(source, /account\.email_confirmed_at is not null/);
  assert.match(source, /where lower\(primary_email\) = v_email\s*\n\s*and email_verified/s);
  assert.doesNotMatch(
    source,
    /p_email[^;]+email_verified\s*=\s*true/is,
  );
});

test("current_app_user_id resolves both legacy and external app identities", async () => {
  const source = await readFile(migrationUrl, "utf8");

  assert.match(source, /v_user := v_subject::uuid/);
  assert.match(source, /from public\.app_users account/);
  assert.match(source, /select identity\.app_user_id/);
  assert.match(source, /identity\.issuer = v_issuer/);
  assert.match(source, /identity\.subject = v_subject/);
});

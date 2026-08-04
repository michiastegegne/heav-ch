import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function read(relativePath) {
  try {
    return await readFile(new URL(relativePath, import.meta.url), "utf8");
  } catch {
    return "";
  }
}

const config = await read("../supabase/config.toml");
const confirmationTemplate = await read("../supabase/templates/confirmation.html");
const recoveryTemplate = await read("../supabase/templates/recovery.html");
const loginScript = await read("../login/assets/login.js");

function section(name) {
  const marker = `[${name}]`;
  const start = config.indexOf(marker);
  if (start < 0) return "";
  const next = config.indexOf("\n[", start + marker.length);
  return config.slice(start, next < 0 ? undefined : next);
}

test("Produktiv-Auth erlaubt bestätigte Passwortkonten mit HEAV-Rücksprungzielen", () => {
  assert.match(config, /site_url\s*=\s*"https:\/\/heav\.ch\/login\/"/);
  assert.match(config, /additional_redirect_urls\s*=\s*\["https:\/\/heav\.ch\/login\/", "https:\/\/www\.heav\.ch\/login\/"\]/);
  assert.match(section("auth"), /enable_signup\s*=\s*true/);
  assert.match(section("auth"), /enable_anonymous_sign_ins\s*=\s*false/);
  assert.match(section("auth.email"), /enable_signup\s*=\s*true/);
  assert.match(section("auth.email"), /enable_confirmations\s*=\s*true/);
  assert.match(section("auth.email"), /otp_length\s*=\s*8/);
  assert.match(section("auth.hook.before_user_created"), /enabled\s*=\s*true/);
  assert.match(section("auth.hook.before_user_created"), /uri\s*=\s*"pg-functions:\/\/postgres\/public\/hook_restrict_heav_signup"/);
  assert.match(config, /\[auth\.email\.template\.confirmation\][\s\S]*?content_path\s*=\s*"\.\/supabase\/templates\/confirmation\.html"/);
  assert.match(config, /\[auth\.email\.template\.recovery\][\s\S]*?content_path\s*=\s*"\.\/supabase\/templates\/recovery\.html"/);
});

test("Auth-E-Mails liefern einen Code statt eines Loginlinks", () => {
  for (const template of [confirmationTemplate, recoveryTemplate]) {
    assert.match(template, /\{\{\s*\.Token\s*\}\}/);
    assert.doesNotMatch(template, /ConfirmationURL/);
    assert.match(template, /HEAV/);
  }
  assert.doesNotMatch(loginScript, /identities/);
});

test("Invoice Function bündelt Schriften und prüft ihre Sitzung selbst", () => {
  assert.match(config, /\[functions\.invoice-document\][\s\S]*?verify_jwt\s*=\s*false/);
  assert.match(config, /\[functions\.invoice-document\][\s\S]*?static_files\s*=\s*\["\.\/functions\/_shared\/fonts\/\*\.ttf"\]/);
});

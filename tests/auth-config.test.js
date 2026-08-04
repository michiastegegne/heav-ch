import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

let config = "";
try {
  config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");
} catch {
  // The RED phase intentionally starts without production auth configuration.
}

test("Produktiv-Auth erlaubt nur bestehende Benutzer und HEAV-Rücksprungziele", () => {
  assert.match(config, /site_url\s*=\s*"https:\/\/heav\.ch\/login\/"/);
  assert.match(config, /additional_redirect_urls\s*=\s*\["https:\/\/heav\.ch\/login\/", "https:\/\/www\.heav\.ch\/login\/"\]/);
  assert.match(config, /\[auth\][\s\S]*?enable_signup\s*=\s*false/);
  assert.match(config, /\[auth\.email\][\s\S]*?enable_signup\s*=\s*true/);
  assert.match(config, /\[functions\.invoice-document\][\s\S]*?verify_jwt\s*=\s*false/);
  assert.match(config, /\[functions\.invoice-document\][\s\S]*?static_files\s*=\s*\["\.\/functions\/_shared\/fonts\/\*\.ttf"\]/);
});

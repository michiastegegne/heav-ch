import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appUrl = new URL("../admin/assets/app.js", import.meta.url);

test("assistant history restore has a distinct nonblocking loading state", async () => {
  const source = await readFile(appUrl, "utf8");

  assert.match(source, /restoring:\s*false/);
  assert.match(source, /Verlauf wird geladen/);
  assert.match(source, /assistantMessages\.setAttribute\("aria-busy"/);
  assert.match(source, /assistantState\.busy \|\| assistantState\.restoring/);
  assert.match(source, /const assistantRestore = restoreAssistantThread\(\)/);
  assert.match(source, /void assistantRestore/);
  assert.doesNotMatch(source, /await restoreAssistantThread\(\)/);
});

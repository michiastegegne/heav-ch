import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const privacy = await readFile(new URL("../privacy/index.html", import.meta.url), "utf8");

test("Privacy notice discloses request-scoped AI screenshot processing", () => {
  assert.match(privacy, /Studio AI assistant/i);
  assert.match(privacy, /OpenAI/i);
  assert.match(privacy, /screenshots are not stored in Supabase Storage/i);
  assert.match(privacy, /chat text and structured proposals are stored/i);
  assert.match(privacy, /not used to train/i);
  assert.match(privacy, /up to 30 days/i);
});

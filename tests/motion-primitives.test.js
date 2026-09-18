import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Studio wires the static Motion-Primitives adapter", async () => {
  const [html, app, css] = await Promise.all([
    read("studio/index.html"),
    read("admin/assets/app.js"),
    read("admin/assets/motion-primitives.css"),
  ]);

  assert.match(html, /motion-primitives\.css\?v=/);
  assert.match(app, /function applyMotionPrimitives\(\)/);
  assert.match(app, /function applyTextEffect\(element\)/);
  assert.match(app, /dataset\.textEffect\s*=\s*"per-char"/);
  assert.match(app, /classList\.add\("mp-text-visible"\)/);
  assert.match(app, /data-motion =?\s*"item"|dataset\.motion\s*=\s*"item"/);
  assert.match(app, /reducedMotionQuery\.matches/);
  assert.match(css, /@keyframes hev-motion-group-enter/);
  assert.match(css, /data-motion="item"/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

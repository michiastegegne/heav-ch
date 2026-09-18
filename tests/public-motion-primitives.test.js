import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Public site wires the Motion-Primitives-style interaction layer", async () => {
  const [html, site, styles] = await Promise.all([
    read("index.html"),
    read("assets/site.js"),
    read("assets/styles.css"),
  ]);

  assert.match(html, /assets\/site\.js\?v=/);
  assert.match(site, /IntersectionObserver/);
  assert.match(site, /motion-scroll-progress/);
  assert.match(site, /mp-stagger-group/);
  assert.match(site, /mp-border-trail/);
  assert.match(site, /mp-spotlight/);
  assert.match(site, /mp-text-effect/);
  assert.match(site, /mp-char/);
  assert.match(site, /prefers-reduced-motion/);
  assert.match(styles, /@keyframes mp-in-view/);
  assert.match(styles, /@keyframes mp-stagger-item/);
  assert.match(styles, /@keyframes mp-border-trail/);
  assert.match(styles, /motion-scroll-progress/);
});

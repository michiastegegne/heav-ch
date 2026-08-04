import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const assertMissing = async (path) => {
  await assert.rejects(stat(new URL(path, root)), (error) => error?.code === "ENOENT");
};

test("Login bietet ausschliesslich den authentifizierten Zugang", async () => {
  const [html, css] = await Promise.all([read("login/index.html"), read("login/assets/login.css")]);
  assert.doesNotMatch(html, /preview|Musterrechnung|installieren|pwa-install/i);
  assert.doesNotMatch(html, /rel="manifest"|apple-touch-icon|assets\/pwa\.js/i);
  assert.doesNotMatch(css, /preview-link|install-trigger|install-dialog|install-panel|native-install/);
  assert.match(html, /id="login-form"/);
  assert.match(html, /Anmeldelink senden/);
});

test("Dokumentation beschreibt ausschliesslich den privaten Zugang", async () => {
  const readme = await read("README.md");
  assert.doesNotMatch(readme, /Progressive Web App|preview=1|demo=1|Musterrechnung|App installieren/i);
  assert.match(readme, /requires a valid Supabase session/);
  assert.match(readme, /http\.server 4180/);
});

test("Admin enthält weder öffentlichen Demo-Modus noch Musterrechnung", async () => {
  const [html, app] = await Promise.all([read("admin/index.html"), read("admin/assets/app.js")]);
  assert.doesNotMatch(html, /rel="manifest"|apple-touch-icon|assets\/pwa\.js/i);
  assert.doesNotMatch(app, /\bDEMO\b|createDemoAdapter|preview=1|params\.get\("preview"\)|params\.get\("demo"\)|HEAV-Musterrechnung/);
  assert.match(app, /getSession\(\)/);
  assert.match(app, /window\.location\.replace\("\/login\/"\)/);
});

test("Installationsartefakte und öffentliches Muster-PDF sind entfernt", async () => {
  for (const path of [
    "manifest.webmanifest",
    "assets/pwa.js",
    "admin/assets/HEAV-Musterrechnung.pdf",
    "assets/app-icons/icon-180.png",
    "assets/app-icons/icon-192.png",
    "assets/app-icons/icon-512.png",
    "assets/app-icons/icon-maskable-512.png",
  ]) await assertMissing(path);
});

test("Service Worker entfernt nur alte HEAV-App-Caches und registriert keine Offline-Vorschau", async () => {
  const worker = await read("service-worker.js");
  assert.match(worker, /heav-studio-/);
  assert.match(worker, /caches\.delete/);
  assert.match(worker, /registration\.unregister/);
  assert.doesNotMatch(worker, /admin\/\?preview=1|HEAV-Musterrechnung|APP_SHELL|addAll|fetch/);
});

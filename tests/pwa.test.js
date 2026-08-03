import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("PWA-Manifest beschreibt eine installierbare HEAV Studio App", async () => {
  const manifest = JSON.parse(await read("manifest.webmanifest"));
  assert.equal(manifest.name, "HEAV Studio");
  assert.equal(manifest.short_name, "HEAV");
  assert.equal(manifest.id, "/admin/");
  assert.equal(manifest.start_url, "/login/?source=pwa");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#090a08");
  assert.equal(manifest.background_color, "#090a08");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.purpose.includes("any")));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose.includes("maskable")));
});

test("PWA-Icons sind echte, nicht-leere PNG-Dateien", async () => {
  for (const path of ["assets/app-icons/icon-180.png", "assets/app-icons/icon-192.png", "assets/app-icons/icon-512.png", "assets/app-icons/icon-maskable-512.png"]) {
    const bytes = await readFile(new URL(path, root));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.ok((await stat(new URL(path, root))).size > 1000, `${path} ist zu klein`);
  }
});

test("Login und Admin verknüpfen Manifest, Apple-Icon und PWA-Registrierung", async () => {
  for (const path of ["login/index.html", "admin/index.html"]) {
    const html = await read(path);
    assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
    assert.match(html, /rel="apple-touch-icon" href="\/assets\/app-icons\/icon-180\.png"/);
    assert.match(html, /apple-mobile-web-app-capable" content="yes"/);
    assert.match(html, /src="\/assets\/pwa\.js"/);
  }
});

test("Standalone-Layouts berücksichtigen mobile Safe Areas", async () => {
  const loginCss = await read("login/assets/login.css");
  const adminCss = await read("admin/assets/admin.css");
  for (const css of [loginCss, adminCss]) {
    assert.match(css, /safe-area-inset-top/);
    assert.match(css, /safe-area-inset-bottom/);
  }
});

test("Service Worker enthält App-Shell und Offline-Vorschau", async () => {
  const worker = await read("service-worker.js");
  for (const asset of ["/login/", "/admin/?preview=1", "/admin/assets/app.js", "/admin/assets/HEAV-Musterrechnung.pdf"]) {
    assert.ok(worker.includes(JSON.stringify(asset)), `${asset} fehlt im App-Shell-Cache`);
  }
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /event\.respondWith/);
});

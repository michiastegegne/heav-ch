import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";

const root = new URL("..", import.meta.url);
const siteRoot = root.pathname;
const publicHtml = [];

async function collectPublicHtml(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    const fromRoot = relative(siteRoot, absolute);
    if (entry.isDirectory()) {
      if ([".git", "admin", "studio", "client", "login", "portal", "supabase", "tests", "node_modules"].includes(entry.name)) continue;
      await collectPublicHtml(absolute);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      publicHtml.push(fromRoot.split(sep).join("/"));
    }
  }
}

await collectPublicHtml(siteRoot);

test("Google Analytics wird erst nach ausdrücklicher Einwilligung geladen", async () => {
  const source = await readFile(new URL("../assets/analytics.js", import.meta.url), "utf8");
  assert.match(source, /const MEASUREMENT_ID = "G-8WXQG8M7CS"/);
  assert.match(source, /localStorage\.getItem\(CONSENT_KEY\)/);
  assert.match(source, /gtag\/js\?id=\$\{MEASUREMENT_ID\}/);
  assert.match(source, /analytics_storage: "granted"/);
  assert.match(source, /analytics_storage: "denied"/);
  assert.match(source, /data-analytics-preferences/);
});

test("Alle öffentlichen Seiten binden den einwilligungsbasierten Analytics-Loader ein", async () => {
  assert.ok(publicHtml.length > 10, "expected the public site to contain multiple HTML pages");
  for (const page of publicHtml) {
    const html = await readFile(resolve(siteRoot, page), "utf8");
    assert.match(
      html,
      /<script src="\/assets\/analytics\.js\?v=michias-personal-20260910" defer><\/script>/,
      `${page} must load the shared analytics consent script`,
    );
  }
});

test("Datenschutzerklärung beschreibt GA4 und die Widerrufsoption", async () => {
  const privacy = await readFile(new URL("../privacy/index.html", import.meta.url), "utf8");
  assert.match(privacy, /Google Analytics 4/);
  assert.match(privacy, /Google Ireland Limited/);
  assert.match(privacy, /data-analytics-preferences/);
});

test("Öffentliche Seiten tragen Michias Tegegne als Personenmarke; HEAV bleibt dem Produktbereich vorbehalten", async () => {
  const canonicalPages = ["index.html", "services/index.html", "work/index.html", "about/index.html", "michias-tegegne/index.html", "contact/index.html", "privacy/index.html", "legal-notice/index.html"];
  for (const page of canonicalPages) {
    const source = await readFile(resolve(siteRoot, page), "utf8");
    assert.match(source, /Michias Tegegne/);
    assert.match(source, /og:site_name" content="Michias Tegegne"/);
    assert.match(source, /"@type": "Person"/);
    assert.doesNotMatch(source, /"@type": "Organization"/);
  }
  for (const page of publicHtml) {
    const source = await readFile(resolve(siteRoot, page), "utf8");
    assert.doesNotMatch(source, /\bHEAV\b/, `${page} must not present the former production brand`);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { HEAV_ADMIN_CONFIG, isBackendConfigured } from "../admin/config.js";

const loginSource = await readFile(new URL("../login/assets/login.js", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../admin/assets/app.js", import.meta.url), "utf8");
const contactSource = await readFile(new URL("../contact/index.html", import.meta.url), "utf8");
const studioHtml = await readFile(new URL("../studio/index.html", import.meta.url), "utf8");
const invoiceDocumentSource = await readFile(new URL("../supabase/functions/invoice-document/index.ts", import.meta.url), "utf8");
const actionCss = await readFile(new URL("../admin/assets/admin-actions.css", import.meta.url), "utf8");
const studioCss = await readFile(new URL("../admin/assets/studio-editorial.css", import.meta.url), "utf8");
const privateBaseCss = await Promise.all([
  readFile(new URL("../admin/assets/admin.css", import.meta.url), "utf8"),
  readFile(new URL("../login/assets/login.css", import.meta.url), "utf8"),
  readFile(new URL("../portal/assets/portal.css", import.meta.url), "utf8"),
]);
const offerSendSource = await readFile(new URL("../supabase/functions/offer-send/index.ts", import.meta.url), "utf8").catch(() => "");

test("Produktionsfrontend ist mit dem HEAV-Supabase-Projekt verbunden", () => {
  assert.equal(HEAV_ADMIN_CONFIG.supabaseUrl, "https://bkazlpqjvbuhwmjcwexn.supabase.co");
  assert.match(HEAV_ADMIN_CONFIG.supabaseAnonKey, /^sb_publishable_[A-Za-z0-9_-]+$/);
  assert.equal(isBackendConfigured(), true);
});

test("Supabase-Browserclient ist auf eine geprüfte Version fixiert", () => {
  for (const source of [loginSource, adminSource]) {
    assert.match(source, /@supabase\/supabase-js@2\.57\.4\/\+esm/);
    assert.doesNotMatch(source, /@supabase\/supabase-js@2\/\+esm/);
  }
});

test("Kontaktformular nutzt die HEAV-eigene Edge Function statt eines sichtbaren Fremdformulars", () => {
  assert.doesNotMatch(contactSource, /formsubmit/i);
  assert.match(contactSource, /data-contact-form/);
  assert.match(contactSource, /assets\/contact-form\.js/);
  assert.match(contactSource, /name="email"/);
  assert.match(contactSource, /data-form-status/);
});

test("Studio lädt das isolierte Editorial-Designsystem in stabiler Reihenfolge", () => {
  const expectedAssets = [
    "/admin/assets/admin.css?v=20260830-discount-edit",
    "/admin/assets/admin-enhancements.css?v=20260910-dashboard-context",
    "/admin/assets/admin-actions.css?v=20260910-layout",
    "/admin/assets/workspace.css?v=20260913-mobile-workspace",
    "/admin/assets/crm-theme.css?v=anthracite-1",
    "/admin/assets/studio-editorial.css?v=editorial-9",
  ];
  const positions = expectedAssets.map((asset) => studioHtml.indexOf(`href="${asset}"`));
  assert.ok(positions.every((position) => position >= 0), "alle Studio-Stylesheets sind versioniert eingebunden");
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "Editorial-Overrides werden zuletzt geladen");
  assert.match(studioHtml, /<html lang="de-CH" class="studio-editorial-root" data-assistant-enabled="false">/);
  assert.match(studioHtml, /<meta name="theme-color" content="#000000"/);
  assert.match(studioHtml, /<body class="crm-theme studio-editorial-theme">/);
  assert.match(studioHtml, /src="\/admin\/assets\/app\.js\?v=20260916-assistant-security-3"/);
  assert.match(adminSource, /dashboard\.js\?v=20260916-revenue-1/);
  assert.match(studioCss, /--studio-accent:\s*#e8e4dc/);
  assert.doesNotMatch(studioCss, /#d7ff38|--studio-acid/);
  assert.doesNotMatch(adminSource, /#d7ff38/);
});

test("Alle referenzierten privaten Schriftdateien sind lokal gebündelt", async () => {
  const references = [...new Set(privateBaseCss.flatMap(source => [...source.matchAll(/url\("(\/assets\/fonts\/[^\"]+\.woff2)"\)/g)].map(match => match[1])))];
  assert.ok(references.length >= 4, "erwartete lokale Schriftfamilien wurden gefunden");
  for (const reference of references) {
    const font = await readFile(new URL(`..${reference}`, import.meta.url));
    assert.ok(font.length > 1024, `${reference} ist keine gültige gebündelte Schriftdatei`);
  }
});

test("Studio verwendet das HEAV-Menü und zugängliche Aktionsicons", () => {
  assert.match(studioHtml, /class="menu-button"[^>]*aria-label="Menü öffnen"[^>]*>Menü<\/button>/);
  assert.match(studioHtml, /class="nav-close"[^>]*aria-label="Menü schliessen"[^>]*>Schliessen<\/button>/);
  assert.match(adminSource, /function actionIconButton/);
  assert.match(adminSource, /actionIconButton\("edit", "Bearbeiten"/);
  assert.match(adminSource, /paper-plane/);
  assert.match(adminSource, /customer-contact/);
  assert.match(studioHtml, /href="\/admin\/assets\/crm-theme\.css\?v=anthracite-1"/);
});

test("Studio-Iconleisten bleiben in einer kompakten Reihe", () => {
  assert.match(actionCss, /\.table-actions\{[^}]*flex-wrap:nowrap/);
  assert.match(actionCss, /\.data-table td:last-child\{[^}]*min-width:240px/);
  assert.match(actionCss, /\.customer-name\{[^}]*gap:7px/);
  assert.match(actionCss, /@media\(max-width:760px\)\{[\s\S]*?\.table-actions\{[\s\S]*?overflow-x:auto/);
});

test("Offerten können zuverlässig kopiert und per HEAV-Mail versendet werden", () => {
  assert.match(adminSource, /data-send-offer/);
  assert.match(adminSource, /sendOffer\(id\)/);
  assert.match(adminSource, /navigator\.clipboard\.writeText/);
  assert.match(adminSource, /document\.execCommand\("copy"\)/);
  assert.match(offerSendSource, /const allowedOrigins = new Set/);
  assert.match(offerSendSource, /origin && !allowedOrigins\.has\(origin\)/);
  assert.match(offerSendSource, /authorization\.startsWith\("Bearer "\)/);
  assert.match(offerSendSource, /caller\.auth\.getUser\(\)/);
  assert.match(offerSendSource, /\.eq\("id", offerId\)\.eq\("owner_id", identity\.user\.id\)/);
  assert.match(offerSendSource, /offer\.status !== "sent"/);
  assert.match(offerSendSource, /offer\.valid_until < new Date\(\)/);
  assert.match(offerSendSource, /customer_portal_memberships/);
  assert.match(offerSendSource, /\.eq\("status", "active"\)/);
  assert.match(offerSendSource, /offer_events/);
  assert.match(offerSendSource, /kind: "emailed"/);
  assert.match(offerSendSource, /RESEND_API_KEY/);
});

test("Portal bietet owner-geschützte Bearbeitung für Kunden, Projekte, Rechnungen und manuelle Statuswahl", () => {
  assert.match(adminSource, /updateCustomer/);
  assert.match(adminSource, /updateProject/);
  assert.match(adminSource, /updateInvoice/);
  assert.match(adminSource, /Versand- und Zahlungsstatus · auch für manuell versandte PDFs/);
  assert.match(adminSource, /data-edit="invoice"/);
});

test("Login loads the cache-safe owner-authority client", async () => {
  const html = await readFile(new URL("../login/index.html", import.meta.url), "utf8");
  assert.match(html, /\/login\/assets\/login\.js\?v=20260916-owner-authority-2/);
});

test("Assistant Edge Function requires gateway JWT verification", async () => {
  const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");
  assert.match(config, /\[functions\.assistant-chat\]\s+verify_jwt = true/);
});

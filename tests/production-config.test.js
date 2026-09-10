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

test("Studio lädt Rabatt-, UI- und Projekt-Canvas-Assets mit Cache-Versionen", () => {
  assert.match(studioHtml, /href="\/admin\/assets\/admin\.css\?v=20260830-discount-edit"/);
  assert.match(studioHtml, /href="\/admin\/assets\/admin-enhancements\.css\?v=20260910-project-canvas"/);
  assert.match(studioHtml, /src="\/admin\/assets\/app\.js\?v=20260910-project-canvas"/);
});

test("Studio-Aktionen verwenden kompakte, zugängliche SVG-Icons", () => {
  assert.match(adminSource, /function actionIconButton/);
  assert.match(adminSource, /actionIconButton\("edit", "Bearbeiten"/);
  assert.match(adminSource, /paper-plane/);
  assert.match(adminSource, /customer-contact/);
  assert.match(studioHtml, /admin-actions\.css\?v=20260910-layout/);
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
  assert.match(offerSendSource, /RESEND_API_KEY/);
  assert.match(offerSendSource, /offerId/);
  assert.match(offerSendSource, /customer_portal_memberships/);
  assert.match(offerSendSource, /offer_events/);
});

test("Portal bietet owner-geschützte Bearbeitung für Kunden, Projekte, Rechnungen und manuelle Statuswahl", () => {
  assert.match(adminSource, /updateCustomer/);
  assert.match(adminSource, /updateProject/);
  assert.match(adminSource, /updateInvoice/);
  assert.match(adminSource, /Versand- und Zahlungsstatus · auch für manuell versandte PDFs/);
  assert.match(adminSource, /data-edit="invoice"/);
});

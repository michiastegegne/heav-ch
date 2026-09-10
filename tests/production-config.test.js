import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { HEAV_ADMIN_CONFIG, isBackendConfigured } from "../admin/config.js";

const loginSource = await readFile(new URL("../login/assets/login.js", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../admin/assets/app.js", import.meta.url), "utf8");
const contactSource = await readFile(new URL("../contact/index.html", import.meta.url), "utf8");
const studioHtml = await readFile(new URL("../studio/index.html", import.meta.url), "utf8");
const invoiceDocumentSource = await readFile(new URL("../supabase/functions/invoice-document/index.ts", import.meta.url), "utf8");

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

test("Studio lädt Rabatt- und UI-Confirm-Assets mit Cache-Versionen", () => {
  assert.match(studioHtml, /href="\/admin\/assets\/admin\.css\?v=20260830-discount-edit"/);
  assert.match(studioHtml, /href="\/admin\/assets\/admin-enhancements\.css\?v=20260909-confirm"/);
  assert.match(studioHtml, /src="\/admin\/assets\/app\.js\?v=20260910-owner-priority"/);
});

test("Studio-Aktionen verwenden kompakte, zugängliche SVG-Icons", () => {
  assert.match(adminSource, /function actionIconButton/);
  assert.match(adminSource, /actionIconButton\("edit", "Bearbeiten"/);
  assert.match(adminSource, /paper-plane/);
  assert.match(adminSource, /customer-contact/);
  assert.match(studioHtml, /admin-actions\.css\?v=20260910-icons/);
});

test("Portal bietet owner-geschützte Bearbeitung für Kunden, Projekte, Rechnungen und manuelle Statuswahl", () => {
  assert.match(adminSource, /updateCustomer/);
  assert.match(adminSource, /updateProject/);
  assert.match(adminSource, /updateInvoice/);
  assert.match(adminSource, /Versand- und Zahlungsstatus · auch für manuell versandte PDFs/);
  assert.match(adminSource, /data-edit="invoice"/);
});

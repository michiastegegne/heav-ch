import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { HEAV_ADMIN_CONFIG, isBackendConfigured } from "../admin/config.js";

const loginSource = await readFile(new URL("../login/assets/login.js", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../admin/assets/app.js", import.meta.url), "utf8");
const contactSource = await readFile(new URL("../kontakt/index.html", import.meta.url), "utf8");
const adminHtml = await readFile(new URL("../admin/index.html", import.meta.url), "utf8");
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

test("Kontaktformular bestätigt Anfragen automatisch an die geprüfte Absenderadresse", () => {
  assert.match(contactSource, /action="https:\/\/formsubmit\.co\/hello@heav\.ch"/);
  assert.match(contactSource, /name="email"/);
  assert.match(contactSource, /name="_autoresponse"/);
  assert.match(contactSource, /Danke für deine Anfrage an HEAV/);
  assert.doesNotMatch(contactSource, /name="_captcha"\s+value="false"/);
});

test("Admin lädt die produktive App mit versionsgebundenem Cache-Busting", () => {
  assert.match(adminHtml, /src="\/admin\/assets\/app\.js\?v=20260812-editable-1"/);
});

test("Portal bietet owner-geschützte Bearbeitung für Kunden, Projekte, Rechnungen und manuelle Statuswahl", () => {
  assert.match(adminSource, /updateCustomer/);
  assert.match(adminSource, /updateProject/);
  assert.match(adminSource, /updateInvoice/);
  assert.match(adminSource, /Status · auch für manuell versandte PDFs/);
  assert.match(adminSource, /data-edit="invoice"/);
});

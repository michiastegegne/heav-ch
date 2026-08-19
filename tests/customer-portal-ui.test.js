import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Kundenportal ist eine private, eigene HEAV-Oberfläche mit Projekten, Dokumenten und Feedback", async () => {
  const html = await read("../portal/index.html");
  const script = await read("../portal/assets/portal.js");
  const css = await read("../portal/assets/portal.css");

  assert.match(html, /<meta name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(html, /id="portal-projects"/);
  assert.match(html, /id="portal-invoices"/);
  assert.match(html, /id="portal-files"/);
  assert.match(html, /id="review-form"/);
  assert.match(script, /customer_portal_memberships/);
  assert.match(script, /createSignedUrl/);
  assert.match(script, /customer_reviews/);
  assert.doesNotMatch(script, /service_role/i);
  assert.match(css, /@media\(max-width:760px\)/);
});

test("Kundenportal-Anfragen werden über eine eigene HEAV-Funktion statt einer offenen Auth-Registrierung übermittelt", async () => {
  const html = await read("../portal/request/index.html");
  const script = await read("../portal/request/assets/request.js");
  assert.match(html, /id="portal-request-form"/);
  assert.match(html, /name="email"/);
  assert.match(script, /functions\/v1\/portal-access-request/);
  assert.doesNotMatch(script, /signUp\(/);
});

test("Login leitet aktive Kundenaccounts ins Portal und Owner weiterhin ins Studio", async () => {
  const script = await read("../login/assets/login.js");
  assert.match(script, /customer_portal_memberships/);
  assert.match(script, /window\.location\.replace\(await workspaceDestination\(\)\)/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Kundenportal ist eine private, eigene HEAV-Oberfläche mit Projekten, Dokumenten und Feedback", async () => {
  const html = await read("../client/index.html");
  const script = await read("../portal/assets/portal.js");
  const css = await read("../portal/assets/portal.css");
  const adminScript = await read("../admin/assets/app.js");

  assert.match(html, /<meta name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(html, /id="portal-projects"/);
  assert.match(html, /id="portal-invoices"/);
  assert.match(html, /id="portal-files"/);
  assert.match(html, /id="review-form"/);
  assert.match(script, /customer_portal_memberships/);
  assert.match(script, /createSignedUrl/);
  assert.match(script, /customer_reviews/);
  assert.match(adminScript, /customer_portal_requests/);
  assert.match(adminScript, /process_customer_portal_request/);
  assert.match(adminScript, /portal-requests/);
  assert.match(adminScript, /Einladung senden/);
  assert.match(adminScript, /portal-send-invite/);
  assert.doesNotMatch(script, /service_role/i);
  assert.match(css, /@media\(max-width:760px\)/);
});

test("Kundenportal-Anfragen werden über eine eigene HEAV-Funktion statt einer offenen Auth-Registrierung übermittelt", async () => {
  const html = await read("../client/request/index.html");
  const script = await read("../portal/request/assets/request.js");
  assert.match(html, /id="portal-request-form"/);
  assert.match(html, /name="email"/);
  assert.match(script, /functions\/v1\/portal-access-request/);
  assert.doesNotMatch(script, /signUp\(/);
});

test("Studio und Kundenportal haben klare kanonische URLs mit Legacy-Weiterleitungen", async () => {
  const [studio, client, adminRedirect, portalRedirect] = await Promise.all([
    read("../studio/index.html"),
    read("../client/index.html"),
    read("../admin/index.html"),
    read("../portal/index.html"),
  ]);
  assert.match(studio, /HEAV STUDIO/);
  assert.match(client, /GESCHÜTZTES KUNDENPORTAL/);
  assert.match(adminRedirect, /location\.replace\(destination\("\/studio\/"\)\)/);
  assert.match(portalRedirect, /location\.replace\(destination\("\/client\/"\)\)/);
});

test("Login leitet aktive Kundenaccounts zum Kundenportal und Owner ins Studio", async () => {
  const script = await read("../login/assets/login.js");
  assert.match(script, /company_settings/);
  assert.match(script, /owner_id/);
  assert.match(script, /\.eq\("user_id", user\.id\)/);
  assert.match(script, /return "\/client\/"/);
  assert.match(script, /return "\/studio\/"/);
  assert.match(script, /workspaceDestination\(data\.session\)/);
});

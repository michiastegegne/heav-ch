import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const contactSource = await readFile(new URL("../contact/index.html", import.meta.url), "utf8");
const contactClient = await readFile(new URL("../assets/contact-form.js", import.meta.url), "utf8");
const privacySource = await readFile(new URL("../privacy/index.html", import.meta.url), "utf8");
const functionSource = await readFile(new URL("../supabase/functions/contact-enquiry/index.ts", import.meta.url), "utf8");
const supabaseConfig = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");

test("Kontaktformular bleibt HEAV-eigen und leitet nicht zu FormSubmit weiter", () => {
  assert.doesNotMatch(contactSource, /formsubmit/i);
  assert.match(contactSource, /data-contact-form/);
  assert.match(contactSource, /assets\/contact-form\.js\?v=contact-heav-reply-20260818/);
  assert.match(contactSource, /data-form-status/);
  assert.match(contactSource, /name="website"/);
  assert.doesNotMatch(contactSource, /name="_autoresponse"/);
});

test("Alle sichtbaren Desktop-Menüs führen zu Contact", async () => {
  const publicPages = [
    "index.html",
    "404.html",
    "about/index.html",
    "contact/index.html",
    "legal-notice/index.html",
    "michias-tegegne/index.html",
    "privacy/index.html",
    "services/index.html",
    "work/index.html",
    "ueber-uns/index.html",
  ];
  const sources = await Promise.all(publicPages.map((path) => readFile(join(process.cwd(), path), "utf8")));
  const desktopNavPages = sources.filter((source) => source.includes('class="desktop-nav"'));
  assert.ok(desktopNavPages.length > 0, "Keine Desktop-Navigation gefunden.");
  for (const source of desktopNavPages) {
    const navigation = source.match(/<nav class="desktop-nav"[\s\S]*?<\/nav>/)?.[0] || "";
    assert.match(navigation, /href="\/contact\/"/, "Desktop-Menü enthält keinen Contact-Link.");
  }
});

test("Kontakt-Client übermittelt asynchron an die HEAV Edge Function", () => {
  assert.match(contactClient, /functions\/v1\/contact-enquiry/);
  assert.match(contactClient, /fetch\(/);
  assert.match(contactClient, /application\/json/);
  assert.match(contactClient, /contactForm\.reset\(\)/);
  assert.match(contactClient, /aria-busy/);
  assert.match(contactClient, /HEAV will get back/);
  assert.doesNotMatch(contactSource, /Michias(?: Tegegne)? will get back/i);
  assert.doesNotMatch(contactClient, /Michias will get back/i);
  assert.doesNotMatch(functionSource, /Michias will review/i);
});

test("Kontakt-Edge-Function validiert, schützt und versendet über den bestehenden HEAV-Mailer", () => {
  assert.match(functionSource, /RESEND_API_KEY/);
  assert.match(functionSource, /RESEND_FROM_EMAIL/);
  assert.match(functionSource, /https:\/\/api\.resend\.com\/emails/);
  assert.match(functionSource, /website/);
  assert.match(functionSource, /Access-Control-Allow-Origin/);
  assert.match(functionSource, /Project enquiry/);
  assert.match(supabaseConfig, /\[functions\.contact-enquiry\][\s\S]*verify_jwt = false/);
});

test("Datenschutzerklärung nennt keine sichtbare FormSubmit-Abhängigkeit mehr", () => {
  assert.doesNotMatch(privacySource, /FormSubmit/i);
  assert.match(privacySource, /Supabase/);
  assert.match(privacySource, /Resend/);
});

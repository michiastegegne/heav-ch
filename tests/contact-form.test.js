import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const contactSource = await readFile(new URL("../contact/index.html", import.meta.url), "utf8");
const contactClient = await readFile(new URL("../assets/contact-form.js", import.meta.url), "utf8");
const privacySource = await readFile(new URL("../privacy/index.html", import.meta.url), "utf8");
const functionSource = await readFile(new URL("../supabase/functions/contact-enquiry/index.ts", import.meta.url), "utf8");
const supabaseConfig = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");

test("Kontaktformular bleibt HEAV-eigen und leitet nicht zu FormSubmit weiter", () => {
  assert.doesNotMatch(contactSource, /formsubmit/i);
  assert.match(contactSource, /data-contact-form/);
  assert.match(contactSource, /assets\/contact-form\.js\?v=contact-description-20260818/);
  assert.match(contactSource, /data-form-status/);
  assert.match(contactSource, /name="website"/);
  assert.doesNotMatch(contactSource, /name="_autoresponse"/);
});

async function publicHtmlSources(directory = process.cwd()) {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if ([".git", "admin", "login", "node_modules", "supabase", "tests"].includes(entry.name)) continue;
      sources.push(...await publicHtmlSources(join(directory, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      sources.push(await readFile(join(directory, entry.name), "utf8"));
    }
  }
  return sources;
}

test("Alle sichtbaren Desktop-Menüs führen zu Contact", async () => {
  const sources = await publicHtmlSources();
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

test("Kurzbeschreibungen werden vor dem Versand klar erklärt", () => {
  assert.match(contactSource, /textarea name="message"[^>]*required/);
  assert.match(contactClient, /Please add a short project description/);
  assert.match(functionSource, /Please add a short project description/);
});

test("Bestätigungsmail nutzt einen eigenen HEAV-Absender und das HEAV-E-Mailbanner", () => {
  assert.match(functionSource, /CONTACT_FROM_EMAIL/);
  assert.match(functionSource, /Project enquiry received — HEAV/);
  assert.match(functionSource, /heav-email-wordmark\.png/);
  assert.match(functionSource, /michias-email-profile\.jpg/);
  assert.match(functionSource, /Founder &amp; Owner \| HEAV/);
  assert.match(functionSource, /width="154" height="35"/);
  assert.match(functionSource, /width="88" height="88"/);
  assert.doesNotMatch(functionSource, /max-width:600px/);
  assert.doesNotMatch(functionSource, /billing/i);
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

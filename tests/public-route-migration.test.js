import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoutes = [
  "services", "work", "work/cars-and-coffee", "work/heilsarmee-liestal-testimonials",
  "work/lawel-new-collection", "work/lawel-new-collection-film", "work/lawel-rainshield-campaign",
  "work/swiss-alps-grindelwald", "about", "contact",
];
const legacyRedirects = new Map([
  ["leistungen", "/services/"], ["arbeiten", "/work/"], ["arbeiten/cars-and-coffee", "/work/cars-and-coffee/"],
  ["arbeiten/heilsarmee-liestal-testimonials", "/work/heilsarmee-liestal-testimonials/"], ["arbeiten/lawel-new-collection", "/work/lawel-new-collection/"],
  ["arbeiten/lawel-new-collection-film", "/work/lawel-new-collection-film/"], ["arbeiten/lawel-rainshield-campaign", "/work/lawel-rainshield-campaign/"],
  ["arbeiten/swiss-alps-grindelwald", "/work/swiss-alps-grindelwald/"], ["ueber-uns", "/about/"], ["kontakt", "/contact/"],
]);

test("English public routes are present and canonical", async () => {
  for (const route of publicRoutes) {
    const file = path.join(root, route, "index.html");
    await access(file);
    const html = await readFile(file, "utf8");
    assert.match(html, new RegExp(`https://heav\\.ch/${route.replaceAll("/", "\\/")}/`));
    assert.doesNotMatch(html, /href="\/(leistungen|arbeiten|ueber-uns|kontakt)\//);
  }
});

test("German legacy routes redirect to their English canonical counterpart", async () => {
  for (const [route, destination] of legacyRedirects) {
    const html = await readFile(path.join(root, route, "index.html"), "utf8");
    assert.match(html, new RegExp(`url=${destination.replaceAll("/", "\\/")}`));
    assert.match(html, /name="robots" content="noindex,follow"/);
    assert.match(html, new RegExp(`canonical" href="https://heav\\.ch${destination.replaceAll("/", "\\/")}`));
  }
});

test("sitemap advertises only English public routes", async () => {
  const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
  for (const route of publicRoutes) assert.match(sitemap, new RegExp(`https://heav\\.ch/${route.replaceAll("/", "\\/")}/`));
  assert.doesNotMatch(sitemap, /https:\/\/heav\.ch\/(leistungen|arbeiten|ueber-uns|kontakt)\//);
});

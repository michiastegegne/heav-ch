import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const workRoot = join(process.cwd(), "work");
const pages = readdirSync(workRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(workRoot, entry.name, "index.html"));

test("Projektseiten laden YouTube direkt ohne Consent-Block", () => {
  assert.ok(pages.length > 0, "Es wurden keine Projektseiten gefunden.");

  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    const match = html.match(
      /<iframe\s+[^>]*src="https:\/\/www\.youtube-nocookie\.com\/embed\/([\w-]+)\?[^"\s]*"[^>]*><\/iframe>/,
    );
    assert.ok(match, `${page} enthält keinen direkten privacy-enhanced YouTube-Player.`);
    assert.ok(!html.includes("video-consent"), `${page} enthält noch den Consent-Block.`);
    assert.ok(!html.includes("data-load-youtube"), `${page} enthält noch den Consent-Button.`);
  }

  const siteScript = readFileSync(join(process.cwd(), "assets", "site.js"), "utf8");
  const stylesheet = readFileSync(join(process.cwd(), "assets", "styles.css"), "utf8");
  assert.ok(!siteScript.includes("data-load-youtube"), "site.js enthält noch den Consent-Loader.");
  assert.ok(!stylesheet.includes("video-consent"), "Stylesheet enthält noch Consent-Block-Stile.");
});

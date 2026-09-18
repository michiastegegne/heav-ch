import { test, expect } from "@playwright/test";

const base = process.env.HEAV_QA_BASE || "http://127.0.0.1:4180";
const publicRoutes = [
  "/",
  "/services/",
  "/work/",
  "/work/lawel-rainshield-campaign/",
  "/work/lawel-new-collection/",
  "/work/heilsarmee-liestal-testimonials/",
  "/work/cars-and-coffee/",
  "/work/swiss-alps-grindelwald/",
  "/about/",
  "/michias-tegegne/",
  "/contact/",
  "/legal-notice/",
  "/privacy/",
];

test.describe("Öffentliche Website: lokale Ressourcen", () => {
  for (const route of publicRoutes) {
    test(`${route} lädt ohne lokale 404-Ressourcen`, async ({ page }) => {
      const failures = [];
      page.on("response", (response) => {
        if (response.url().startsWith(base) && response.status() >= 400) {
          failures.push(`${response.status()} ${response.url()}`);
        }
      });

      const response = await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
      expect(response?.status(), `${route} sollte direkt erreichbar sein`).toBe(200);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);

      expect(failures, `${route} hat fehlerhafte lokale Ressourcen`).toEqual([]);
      await expect(page.locator('body')).not.toHaveClass(/crm-theme|studio-editorial-theme/);
      const privateThemeLinks = await page.locator('link[rel="stylesheet"]').evaluateAll((links) => links
        .map((link) => link.getAttribute('href') || '')
        .filter((href) => /crm-theme|studio-editorial/.test(href)));
      expect(privateThemeLinks, `${route} darf keine privaten App-Themes laden`).toEqual([]);
    });
  }
});

test("Öffentliche Website aktiviert Motion-Primitives progressiv und respektiert Reduced Motion", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/work/`, { waitUntil: "networkidle" });
  const motion = await page.evaluate(() => ({
    ready: document.documentElement.classList.contains("motion-primitives-ready"),
    progress: Boolean(document.querySelector(".motion-scroll-progress")),
    revealTargets: document.querySelectorAll(".mp-reveal").length,
    staggerGroups: document.querySelectorAll(".mp-stagger-group").length,
    inViewTargets: document.querySelectorAll(".mp-in-view").length,
    textEffects: document.querySelectorAll(".mp-text-effect").length,
    textChars: document.querySelectorAll(".mp-text-effect .mp-char").length,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(motion.ready).toBe(true);
  expect(motion.progress).toBe(true);
  expect(motion.revealTargets).toBeGreaterThan(0);
  expect(motion.staggerGroups).toBeGreaterThan(0);
  expect(motion.inViewTargets).toBeGreaterThan(0);
  expect(motion.textEffects).toBeGreaterThan(0);
  expect(motion.textChars).toBeGreaterThan(10);
  expect(motion.scrollWidth).toBe(motion.clientWidth);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload({ waitUntil: "networkidle" });
  const reduced = await page.evaluate(() => ({
    progressHidden: getComputedStyle(document.querySelector(".motion-scroll-progress")).display === "none",
    revealAnimation: getComputedStyle(document.querySelector(".mp-reveal")).animationName,
    textOpacity: getComputedStyle(document.querySelector(".mp-text-effect .mp-char")).opacity,
    textTransform: getComputedStyle(document.querySelector(".mp-text-effect .mp-char")).transform,
  }));
  expect(reduced.progressHidden).toBe(true);
  expect(reduced.revealAnimation).toBe("none");
  expect(reduced.textOpacity).toBe("1");
  expect(reduced.textTransform).toBe("none");
  await page.close();
});

test("Motion-TextEffect bewahrt das zweizeilige Startseiten-Wortbild", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
  await page.addInitScript(() => localStorage.setItem("heav-analytics-consent", "denied"));
  await page.goto(`${base}/`, { waitUntil: "networkidle" });

  const wordmark = await page.locator(".temporary-home-logo-mark.personal-wordmark").evaluate((element) => ({
    text: element.innerText.replace(/\s+/g, " ").trim(),
    lines: [...element.children].map((line) => {
      const rect = line.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  }));

  expect(wordmark.text).toBe("Michias Tegegne.");
  expect(wordmark.lines).toHaveLength(2);
  for (const line of wordmark.lines) {
    expect(line.width).toBeGreaterThan(line.height * 1.5);
  }
  await page.close();
});

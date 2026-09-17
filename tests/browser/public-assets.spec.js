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
    });
  }
});

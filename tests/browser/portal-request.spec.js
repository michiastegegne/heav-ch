import { test, expect } from "@playwright/test";
import { assertDarkTheme } from './theme-assertions.js';

const base = process.env.HEAV_QA_BASE || "http://127.0.0.1:4180";

for (const width of [360, 390, 768, 1440]) {
test(`Portal-Anfrage: Versand zeigt Erfolgsmoment bei ${width}px`, async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: width < 821, hasTouch: width < 821 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/functions/v1/portal-access-request", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto(`${base}/client/request/`);
  await page.getByLabel("Your name").fill("Mira Muster");
  await assertDarkTheme(page);
  await page.getByLabel("Email").fill("mira@example.com");
  await page.getByRole("button", { name: /Send request/ }).click();

  await expect(page.locator("#request-message")).toHaveClass(/is-dispatch-success/);
  await expect(page.locator("#request-message .send-plane")).toBeVisible();
  await expect(page.locator("#request-message .send-check")).toBeVisible();
  await page.waitForTimeout(800);
  await page.mouse.move(0, 0);
  await assertDarkTheme(page);
  await page.screenshot({ path: `qa/portal-request-success-${width}.png`, fullPage: true });
  await expect(page.getByLabel("Your name")).toHaveValue("");
  const metrics = await page.evaluate(() => ({
    innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    inputHeight: document.querySelector('[name="contact_name"]').getBoundingClientRect().height,
    signInHeight: document.querySelector(".portal-request-signin").getBoundingClientRect().height,
  }));
  expect(metrics.innerWidth).toBe(width);
  expect(metrics.clientWidth).toBe(width);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.inputHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.signInHeight).toBeGreaterThanOrEqual(44);
  expect(errors).toEqual([]);
  await page.close();
});
}

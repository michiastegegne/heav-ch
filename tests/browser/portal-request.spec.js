import { test, expect } from "@playwright/test";

const base = "http://127.0.0.1:4180";

test("Portal-Anfrage: Versand zeigt Erfolgsmoment und bleibt mobil bedienbar", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/functions/v1/portal-access-request", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto(`${base}/portal/request/`);
  await page.getByLabel("Your name").fill("Mira Muster");
  await page.getByLabel("Email").fill("mira@example.com");
  await page.getByRole("button", { name: /Send request/ }).click();

  await expect(page.locator("#request-message")).toHaveClass(/is-dispatch-success/);
  await expect(page.locator("#request-message .send-plane")).toBeVisible();
  await expect(page.locator("#request-message .send-check")).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "qa/portal-request-success-mobile.png", fullPage: true });
  await expect(page.getByLabel("Your name")).toHaveValue("");
  const metrics = await page.evaluate(() => ({
    innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    inputHeight: document.querySelector('[name="contact_name"]').getBoundingClientRect().height,
    signInHeight: document.querySelector(".portal-request-signin").getBoundingClientRect().height,
  }));
  expect(metrics.innerWidth).toBe(390);
  expect(metrics.clientWidth).toBe(390);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.inputHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.signInHeight).toBeGreaterThanOrEqual(44);
  expect(errors).toEqual([]);
  await page.close();
});

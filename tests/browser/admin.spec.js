import { test, expect } from "@playwright/test";

const base = "http://127.0.0.1:4179";

async function assertHealthy(page, errors) {
  const metrics = await page.evaluate(() => ({
    innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.clientWidth).toBe(metrics.innerWidth);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(errors).toEqual([]);
}

test("Desktop: Dashboard und vollständiger Erfassungsfluss", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}/admin/?demo=1`);
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  await expect(page.getByText("Good work.")).toBeVisible();

  await page.locator('.nav-link[data-view="customers"]').click();
  await page.locator('[data-create="customer"]').first().click();
  await page.locator('[name="company"]').fill("Testkunde AG");
  await page.locator('[name="contact_name"]').fill("Mira Muster");
  await page.locator('[name="email"]').fill("mira@example.com");
  await page.locator('[name="address_line1"]').fill("Testweg 1");
  await page.locator('[name="postal_code"]').fill("4000");
  await page.locator('[name="city"]').fill("Basel");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator(".data-table").getByText("Testkunde AG", { exact: true })).toBeVisible();

  await page.locator('.nav-link[data-view="invoices"]').click();
  await page.locator('[data-create="invoice"]').first().click();
  await page.locator('[name="customer_id"]').selectOption({ label: "Testkunde AG" });
  await page.locator('[name="item_description"]').fill("Brand Film Konzeption");
  await page.locator('[name="item_price"]').fill("1200");
  await expect(page.locator("#invoice-total")).toContainText("CHF 1’297.20");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator(".data-table").getByText("HEAV-2026-003", { exact: true })).toBeVisible();
  const newInvoiceRow = page.locator(".data-table tbody tr").filter({ hasText: "HEAV-2026-003" });
  const downloadPromise = page.waitForEvent("download");
  await newInvoiceRow.getByRole("button", { name: "PDF", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("HEAV-2026-003.pdf");
  await assertHealthy(page, errors);
  await page.screenshot({ path: "qa/admin-desktop.png", fullPage: true });
  await page.close();
});

test("Mobile: echte 390px-Ansicht, Navigation und Rechnungsdialog", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}/admin/?demo=1`);
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await expect(page.locator("#admin-shell")).toHaveClass(/nav-open/);
  await expect(page.locator("#sidebar")).toBeVisible();
  await page.locator('.nav-link[data-view="invoices"]').click();
  await expect(page.locator("#view-title")).toHaveText("Rechnungen");
  const filterMetrics = await page.locator(".filter-tabs").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(filterMetrics.scrollWidth).toBeLessThanOrEqual(filterMetrics.clientWidth);
  await page.locator("[data-create=invoice]").first().click();
  await expect(page.getByRole("heading", { name: "Rechnung erstellen" })).toBeVisible();
  await assertHealthy(page, errors);
  await page.screenshot({ path: "qa/admin-mobile-invoice.png", fullPage: true });
  const close = page.getByRole("button", { name: "Dialog schliessen" });
  const box = await close.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.close();
});

test("Login: sendet einen echten Magic-Link nur für bestehende Benutzer", async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `export function createClient() {
        return { auth: {
          getSession: async () => ({ data: { session: null } }),
          signInWithOtp: async (payload) => {
            window.__heavOtpPayload = payload;
            return { error: null };
          }
        } };
      }`,
    });
  });
  await page.goto(`${base}/login/`);
  await expect(page).toHaveTitle("Login – HEAV Studio");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByLabel("E-Mail").fill("admin@heav.ch");
  await page.getByRole("button", { name: /Anmeldelink senden/ }).click();
  await expect.poll(() => page.evaluate(() => window.__heavOtpPayload)).toEqual({
    email: "admin@heav.ch",
    options: { emailRedirectTo: "http://127.0.0.1:4179/login/", shouldCreateUser: false },
  });
  await expect(page.getByText(/Anmeldelink wurde gesendet/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Vorschau öffnen" })).toHaveAttribute("href", "/admin/?preview=1");
});

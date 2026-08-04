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

async function mockLoginSupabase(page) {
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `export function createClient() {
        return { auth: {
          getSession: async () => ({ data: { session: localStorage.getItem("__heavMockSession") ? { access_token: "test" } : null } }),
          signInWithPassword: async (payload) => {
            localStorage.setItem("__heavPasswordPayload", JSON.stringify(payload));
            localStorage.setItem("__heavMockSession", "1");
            return { data: { session: { access_token: "test" } }, error: null };
          },
          signUp: async (payload) => {
            localStorage.setItem("__heavSignupPayload", JSON.stringify(payload));
            if (localStorage.getItem("__heavDelaySignup")) await new Promise((resolve) => setTimeout(resolve, 150));
            return { data: { user: { identities: [{ id: "test" }] }, session: null }, error: null };
          },
          resetPasswordForEmail: async (email, options) => {
            localStorage.setItem("__heavRecoveryRequest", JSON.stringify({ email, options }));
            return { data: {}, error: null };
          },
          verifyOtp: async (payload) => {
            localStorage.setItem("__heavVerifyPayload", JSON.stringify(payload));
            localStorage.setItem("__heavMockSession", "1");
            return { data: { session: { access_token: "test" } }, error: null };
          },
          updateUser: async (payload) => {
            localStorage.setItem("__heavUpdateUserPayload", JSON.stringify(payload));
            return { data: { user: { id: "test" } }, error: null };
          }
        } };
      }`,
    });
  });
}

test("Login: meldet ein gespeichertes Apple-Passwörter-Konto an", async ({ page }) => {
  await mockLoginSupabase(page);
  await page.goto(`${base}/login/`);
  await expect(page).toHaveTitle("Login – HEAV Studio");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByLabel("E-Mail", { exact: true })).toHaveAttribute("autocomplete", "username");
  await expect(page.getByLabel("Passwort", { exact: true })).toHaveAttribute("autocomplete", "current-password");
  await page.getByLabel("E-Mail", { exact: true }).fill("admin@heav.ch");
  await page.getByLabel("Passwort", { exact: true }).fill("Starkes-Passwort-2026!");
  await page.locator("#login-form").getByRole("button", { name: /Anmelden/ }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("__heavPasswordPayload")))).toEqual({
    email: "admin@heav.ch",
    password: "Starkes-Passwort-2026!",
  });
  await expect(page).toHaveURL(`${base}/admin/`);
});

test("Registrierung: sendet einen E-Mail-Code und bestätigt das neue Konto", async ({ page }) => {
  await mockLoginSupabase(page);
  await page.goto(`${base}/login/`);
  await page.getByRole("button", { name: "Konto erstellen" }).click();
  await expect(page.getByLabel("Neues Passwort", { exact: true })).toHaveAttribute("autocomplete", "new-password");
  await expect(page.getByLabel("Passwort wiederholen", { exact: true })).toHaveAttribute("autocomplete", "new-password");
  await page.getByLabel("E-Mail für neues Konto").fill("admin@heav.ch");
  await page.getByLabel("Neues Passwort", { exact: true }).fill("Starkes-Passwort-2026!");
  await page.getByLabel("Passwort wiederholen", { exact: true }).fill("Starkes-Passwort-2026!");
  await page.getByRole("button", { name: /Bestätigungscode senden/ }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("__heavSignupPayload")))).toEqual({
    email: "admin@heav.ch",
    password: "Starkes-Passwort-2026!",
    options: { emailRedirectTo: "http://127.0.0.1:4179/login/" },
  });
  await expect(page.getByLabel("8-stelliger Code")).toHaveAttribute("autocomplete", "one-time-code");
  await page.getByLabel("8-stelliger Code").fill("12345678");
  await page.getByRole("button", { name: /Konto bestätigen/ }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("__heavVerifyPayload")))).toEqual({
    email: "admin@heav.ch",
    token: "12345678",
    type: "signup",
  });
  await expect(page).toHaveURL(`${base}/admin/`);
});

test("Passwort-Wiederherstellung: bestätigt den Code und speichert ein neues Apple-Passwörter-Passwort", async ({ page }) => {
  await mockLoginSupabase(page);
  await page.goto(`${base}/login/`);
  await page.getByRole("button", { name: /Passwort vergessen/ }).click();
  await page.getByLabel("E-Mail für Wiederherstellung").fill("admin@heav.ch");
  await page.getByRole("button", { name: /Wiederherstellungscode senden/ }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("__heavRecoveryRequest")))).toEqual({
    email: "admin@heav.ch",
    options: { redirectTo: "http://127.0.0.1:4179/login/" },
  });
  await expect(page.getByLabel("Wiederherstellungscode")).toHaveAttribute("autocomplete", "one-time-code");
  await expect(page.getByLabel("Neues Passwort für das Konto")).toHaveAttribute("autocomplete", "new-password");
  await page.getByLabel("Wiederherstellungscode").fill("87654321");
  await page.getByLabel("Neues Passwort für das Konto").fill("Neues-Passwort-2026!");
  await page.getByLabel("Neues Passwort wiederholen").fill("Neues-Passwort-2026!");
  await page.getByRole("button", { name: /Passwort speichern/ }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("__heavVerifyPayload")))).toEqual({
    email: "admin@heav.ch",
    token: "87654321",
    type: "recovery",
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("__heavUpdateUserPayload")))).toEqual({
    password: "Neues-Passwort-2026!",
  });
  await expect(page).toHaveURL(`${base}/admin/`);
});

test("Auth-Zustand: sperrt Moduswechsel während einer laufenden Registrierung", async ({ page }) => {
  await mockLoginSupabase(page);
  await page.goto(`${base}/login/`);
  await page.evaluate(() => localStorage.setItem("__heavDelaySignup", "1"));
  await page.locator("#show-signup").click();
  await page.getByLabel("E-Mail für neues Konto").fill("admin@heav.ch");
  await page.getByLabel("Neues Passwort", { exact: true }).fill("Starkes-Passwort-2026!");
  await page.getByLabel("Passwort wiederholen", { exact: true }).fill("Starkes-Passwort-2026!");
  await page.getByRole("button", { name: /Bestätigungscode senden/ }).click();
  await expect(page.locator("#show-login")).toBeDisabled();
  await expect(page.locator("#show-signup")).toBeDisabled();
  await expect(page.locator("#verify-form")).toBeVisible();
  await expect(page.locator("#login-form")).toBeHidden();
  await expect(page.locator("#signup-form")).toBeHidden();
});

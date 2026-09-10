import { test, expect } from "@playwright/test";

const base = "http://127.0.0.1:4180";

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

async function mockStudioSupabase(page) {
  await page.addInitScript(() => localStorage.setItem("__heavStudioSession", "1"));
  await page.route("https://bkazlpqjvbuhwmjcwexn.supabase.co/functions/v1/invoice-document", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\\n% HEAV test PDF\\n%%EOF" });
  });
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `const store = {
        customers: [
          { id: "c1", company: "Nordlicht AG", contact_name: "Anna Keller", email: "anna@nordlicht.example", phone: "", city: "Basel", postal_code: "4051", address_line1: "Teststrasse 1", country: "Schweiz" },
          { id: "c2", company: "Atelier Morgen", contact_name: "Noah Frei", email: "noah@morgen.example", phone: "", city: "Zürich", postal_code: "8004", address_line1: "Testweg 2", country: "Schweiz" }
        ],
        projects: [
          { id: "p1", customer_id: "c1", title: "Brand Film 2026", status: "active", budget_rappen: 1850000, start_date: "2026-07-15", due_date: "2026-09-18", description: "Brand Film" },
          { id: "p2", customer_id: "c2", title: "Campaign Content", status: "planning", budget_rappen: 920000, start_date: "2026-08-20", due_date: "2026-10-02", description: "Campaign" }
        ],
        invoices: [
          { id: "i1", customer_id: "c1", project_id: "p1", invoice_number: "HEAV-2026-001", payment_reference: "RF51HEAV2026000001", issue_date: "2026-07-28", due_date: "2026-08-27", status: "sent", subtotal_rappen: 850000, tax_rappen: 68850, total_rappen: 918850, tax_rate: 8.1, invoice_items: [] },
          { id: "i2", customer_id: "c2", project_id: "p2", invoice_number: "HEAV-2026-002", payment_reference: "RF24HEAV2026000002", issue_date: "2026-08-01", due_date: "2026-08-31", status: "sent", subtotal_rappen: 50820, tax_rappen: 0, total_rappen: 50820, tax_rate: 0, invoice_items: [
            { position: 1, description: "Foto- & Videoproduktion vor Ort", quantity: 2.75, unit_price_rappen: 15000 },
            { position: 2, description: "Persönlicher Sonderrabatt", quantity: 1, unit_price_rappen: -6190 },
            { position: 3, description: "Foto-/Equipment-Zuschlag", quantity: 1, unit_price_rappen: 10000 },
            { position: 4, description: "An- und Rückreise", quantity: 1, unit_price_rappen: 5760 }
          ] }
        ],
        offers: [
          { id: "o1", customer_id: "c1", project_id: "p1", offer_number: "HEAV-O-2026-001", title: "Brand Film Produktion", issue_date: "2026-09-01", valid_until: "2026-10-01", status: "draft", subtotal_rappen: 500000, tax_rappen: 40500, total_rappen: 540500, tax_rate: 8.1, notes: "Produktion gemäss Briefing.", terms: "Mit der Annahme ist die Offerte verbindlich.", offer_items: [{ position: 1, description: "Produktion", quantity: 1, unit_price_rappen: 500000 }] }
        ],
        company_settings: [{ company_name: "HEAV", owner_name: "Michias Tegegne", email: "hello@heav.ch", iban: "", default_tax_rate: 8.1, default_due_days: 30 }],
        customer_portal_memberships: [],
        customer_portal_requests: [{ id: "r1", company: "Studio Nord", contact_name: "Lea Meier", email: "lea@studio-nord.example", phone: "+41 79 123 45 67", message: "Zugang für die Filmabnahme 2026.", status: "pending", created_at: "2026-09-09T10:00:00Z" }]
      };
      const result = (data) => ({ data, error: null });
      export function createClient() {
        return {
          auth: {
            getSession: async () => ({ data: { session: { access_token: "test", user: { id: "owner-test" } } }, error: null }),
            signOut: async () => ({ error: null })
          },
          from(table) {
            const builder = {
              select() { return builder; },
              eq() { return builder; },
              order: async () => result(store[table]),
              maybeSingle: async () => result(store[table][0] || null),
              limit: async () => result(store[table].slice(0, 1)),
              insert: async (payload) => { store[table].push({ id: crypto.randomUUID(), ...payload }); return result(null); },
              upsert: async (payload) => { store[table] = [{ ...store[table][0], ...payload }]; return result(null); }
            };
            return builder;
          },
          rpc: async (name, payload) => {
            if (name === "update_invoice") {
              window.__lastUpdatedInvoiceItems = payload.p_items;
            }
            if (name === "create_invoice") {
              window.__lastCreatedInvoiceItems = payload.p_items;
              const subtotal = payload.p_items.reduce((sum, item) => sum + Math.round(item.quantity * item.unit_price_rappen), 0);
              const tax = Math.round(subtotal * payload.p_tax_rate / 100);
              store.invoices.unshift({ id: crypto.randomUUID(), customer_id: payload.p_customer_id, project_id: payload.p_project_id, invoice_number: "HEAV-2026-003", payment_reference: "RF94HEAV2026000003", issue_date: payload.p_issue_date, due_date: payload.p_due_date, status: "draft", subtotal_rappen: subtotal, tax_rappen: tax, total_rappen: subtotal + tax, tax_rate: payload.p_tax_rate, invoice_items: payload.p_items });
            }
            if (name === "create_offer") {
              const subtotal = payload.p_items.reduce((sum, item) => sum + Math.round(item.quantity * item.unit_price_rappen), 0);
              const tax = Math.round(subtotal * payload.p_tax_rate / 100);
              store.offers.unshift({ id: crypto.randomUUID(), customer_id: payload.p_customer_id, project_id: payload.p_project_id, offer_number: "HEAV-O-2026-002", title: payload.p_title, issue_date: payload.p_issue_date, valid_until: payload.p_valid_until, status: "draft", subtotal_rappen: subtotal, tax_rappen: tax, total_rappen: subtotal + tax, tax_rate: payload.p_tax_rate, notes: payload.p_notes, terms: payload.p_terms, offer_items: payload.p_items });
            }
            if (name === "share_customer_offer") {
              const offer = store.offers.find((item) => item.id === payload.p_offer_id); if (offer) offer.status = "sent";
            }
            if (name === "delete_draft_invoice") {
              store.invoices = store.invoices.filter((item) => item.id !== payload.p_invoice_id);
            }
            if (name === "delete_project") {
              store.projects = store.projects.filter((item) => item.id !== payload.p_project_id);
            }
            if (name === "delete_customer") {
              store.customers = store.customers.filter((item) => item.id !== payload.p_customer_id);
            }
            return result(null);
          },
          functions: {
            invoke: async (name, { body }) => {
              if (name === "offer-send") window.__lastOfferEmail = body;
              return { data: { recipient: "anna@nordlicht.example" }, error: null };
            }
          }
        };
      }`,
    });
  });
}

async function mockClientSupabase(page) {
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `const result = (data) => ({ data, error: null });
      export function createClient() {
        return {
          auth: { getSession: async () => ({ data: { session: { access_token: "client-test", user: { id: "client-test" } } }, error: null }) },
          from(table) {
            const builder = {
              select() { return builder; }, eq() { return builder; }, order: async () => result([]), maybeSingle: async () => result(null), limit: async () => result(table === "customer_portal_memberships" ? [{ id: "membership-test" }] : [])
            };
            return builder;
          }
        };
      }`,
    });
  });
}

test("Client-Konto wird aus dem Studio ins private Kundenportal umgeleitet", async ({ page }) => {
  await mockClientSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.waitForURL(/\/client\/$/);
});

test("Desktop: Dashboard und vollständiger Erfassungsfluss", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await mockStudioSupabase(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}/admin/`);
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Everything, in its place." })).toBeVisible();
  await expect(page.getByText("MONEY FLOW", { exact: true })).toBeVisible();
  await expect(page.locator(".dashboard-focus").getByRole("heading", { name: "Brand Film 2026" })).toBeVisible();
  await page.getByRole("button", { name: "Projekt-Canvas öffnen" }).click();
  await expect(page.getByRole("heading", { name: "Brand Film 2026" })).toBeVisible();

  await page.locator('.nav-link[data-view="customers"]').click();
  await expect(page.locator(".topbar .primary-action")).toHaveText(/Kunde erfassen/);
  await page.locator('[data-create="customer"]').first().click();
  await page.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.locator("#editor-dialog")).not.toBeVisible();

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
  await expect(page.locator('[name="project_id"] option')).toHaveCount(1);
  await page.locator('[name="item_description"]').fill("Brand Film Konzeption");
  await page.locator('[name="item_price"]').fill("1200");
  await expect(page.locator("#invoice-total")).toContainText("CHF 1’200.00");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator(".data-table").getByText("HEAV-2026-003", { exact: true })).toBeVisible();
  const newInvoiceRow = page.locator(".data-table tbody tr").filter({ hasText: "HEAV-2026-003" });
  const downloadPromise = page.waitForEvent("download");
  await newInvoiceRow.getByRole("button", { name: "PDF herunterladen", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("HEAV-2026-003.pdf");
  await expect(newInvoiceRow).toContainText("RF94 HEAV 2026 0000 03");
  await newInvoiceRow.getByRole("button", { name: "Rechnung senden" }).click();
  await expect(page.locator("#action-confirm-dialog")).toBeVisible();
  await expect(page.locator("#action-confirm-dialog")).toContainText("Rechnung jetzt senden?");
  await expect(page.locator("#action-confirm-dialog")).toContainText("mira@example.com");
  await page.screenshot({ path: "qa/admin-send-confirm-dialog.png", fullPage: true });
  await page.locator("#action-confirm-dialog").getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.locator("#action-confirm-dialog")).toBeHidden();

  await newInvoiceRow.getByRole("button", { name: /Rechnung löschen/ }).click();
  await expect(page.locator("#action-confirm-dialog")).toBeVisible();
  await page.locator("#action-confirm-dialog").getByRole("button", { name: "Löschen" }).click();
  await expect(newInvoiceRow).toHaveCount(0);

  await page.locator('.nav-link[data-view="projects"]').click();
  const projectRow = page.locator(".data-table tbody tr").filter({ hasText: "Campaign Content" });
  await projectRow.getByRole("button", { name: /Projekt löschen/ }).click();
  await page.locator("#action-confirm-dialog").getByRole("button", { name: "Löschen" }).click();
  await expect(projectRow).toHaveCount(0);

  await page.locator('.nav-link[data-view="customers"]').click();
  const customerRow = page.locator(".data-table tbody tr").filter({ hasText: "Testkunde AG" });
  await customerRow.getByRole("button", { name: /Kunde löschen/ }).click();
  await page.locator("#action-confirm-dialog").getByRole("button", { name: "Löschen" }).click();
  await expect(customerRow).toHaveCount(0);

  await assertHealthy(page, errors);
  await page.screenshot({ path: "qa/admin-desktop.png", fullPage: true });
  await page.close();
});

test("Dashboard: Fokus, Geldfluss und Produktionen bleiben auf Desktop und Mobile klar", async ({ browser }) => {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await mockStudioSupabase(desktop);
  const desktopErrors = [];
  desktop.on("pageerror", (error) => desktopErrors.push(error.message));
  desktop.on("console", (message) => { if (message.type() === "error") desktopErrors.push(message.text()); });
  await desktop.goto(`${base}/admin/`);
  await expect(desktop.locator(".dashboard-stage")).toBeVisible();
  await expect(desktop.locator(".dashboard-focus-modules > div")).toHaveCount(3);
  await expect(desktop.locator(".dashboard-production-row")).toHaveCount(2);
  await desktop.waitForTimeout(700);
  await desktop.screenshot({ path: "qa/admin-dashboard-desktop.png", fullPage: true });
  await assertHealthy(desktop, desktopErrors);
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mockStudioSupabase(mobile);
  const mobileErrors = [];
  mobile.on("pageerror", (error) => mobileErrors.push(error.message));
  mobile.on("console", (message) => { if (message.type() === "error") mobileErrors.push(message.text()); });
  await mobile.goto(`${base}/admin/`);
  await expect(mobile.locator(".dashboard-focus")).toBeVisible();
  await expect(mobile.locator(".dashboard-focus-footer .primary-action")).toHaveCSS("min-height", "44px");
  await mobile.waitForTimeout(700);
  await mobile.screenshot({ path: "qa/admin-dashboard-mobile.png", fullPage: true });
  await assertHealthy(mobile, mobileErrors);
  await mobile.close();
});

test("Kunde: Privatkunde ohne Firma und Kontaktdaten speichern", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await mockStudioSupabase(page);
  await page.goto(`${base}/admin/`);
  await page.locator('.nav-link[data-view="customers"]').click();
  await page.locator('[data-create="customer"]').first().click();
  await page.locator('[name="contact_name"]').fill("Noah Frei");
  await page.getByRole("button", { name: "Speichern" }).click();
  const privateCustomerRow = page.locator(".data-table tbody tr").filter({ hasText: "Noah Frei" }).filter({ hasText: "Privatkunde" });
  await expect(privateCustomerRow).toBeVisible();
  await expect(privateCustomerRow.locator("strong")).toHaveText("Noah Frei");
  await page.close();
});

test("Bestehende negative Rabattposition lässt sich ohne native Zahlenfeld-Sperre bearbeiten", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await mockStudioSupabase(page);
  await page.goto(`${base}/admin/`);
  await page.locator('.nav-link[data-view="invoices"]').click();
  const invoiceRow = page.locator(".data-table tbody tr").filter({ hasText: "HEAV-2026-002" });
  await invoiceRow.getByRole("button", { name: "Bearbeiten" }).click();

  const discountRow = page.locator(".invoice-item").nth(1);
  await expect(discountRow.locator('[name="discount_value"]')).toHaveValue("61.9");
  await expect(discountRow.locator('[name="discount_value"]')).toHaveAttribute("min", "0.01");
  await expect(discountRow.locator('[name="item_price"]')).toHaveCount(0);
  const servicePriceBox = await page.locator('.invoice-item').first().locator('[name="item_price"]').boundingBox();
  const discountValueBox = await discountRow.locator('[name="discount_value"]').boundingBox();
  expect(discountValueBox.x).toBeCloseTo(servicePriceBox.x, 0);
  await expect(page.locator("#invoice-total")).toContainText("CHF 508.20");

  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.locator("#editor-dialog")).not.toBeVisible();
  expect(await page.evaluate(() => window.__lastUpdatedInvoiceItems)).toEqual([
    { description: "Foto- & Videoproduktion vor Ort", quantity: 2.75, unit_price_rappen: 15000 },
    { description: "Persönlicher Sonderrabatt", quantity: 1, unit_price_rappen: -6190 },
    { description: "Foto-/Equipment-Zuschlag", quantity: 1, unit_price_rappen: 10000 },
    { description: "An- und Rückreise", quantity: 1, unit_price_rappen: 5760 },
  ]);
  await page.close();
});

test("Neue Rechnung erhält einen klaren Rabatt-Workflow statt negativer Preiseingabe", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await mockStudioSupabase(page);
  await page.goto(`${base}/admin/`);
  await page.getByRole("button", { name: /Neue Rechnung/ }).click();
  await page.locator('select[name="customer_id"]').selectOption("c2");
  const serviceRow = page.locator(".invoice-item").first();
  await serviceRow.locator('[name="item_description"]').fill("Produktion");
  await serviceRow.locator('[name="item_quantity"]').fill("2");
  await serviceRow.locator('[name="item_price"]').fill("100");

  await page.getByRole("button", { name: "Rabatt hinzufügen" }).click();
  const discountRow = page.locator(".invoice-item.is-discount");
  await discountRow.locator('[name="item_description"]').fill("Persönlicher Sonderrabatt");
  await discountRow.locator('[name="discount_value"]').fill("25");
  await expect(page.locator("#invoice-total")).toContainText("CHF 175.00");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();

  expect(await page.evaluate(() => window.__lastCreatedInvoiceItems)).toEqual([
    { description: "Produktion", quantity: 2, unit_price_rappen: 10000 },
    { description: "Persönlicher Sonderrabatt", quantity: 1, unit_price_rappen: -2500 },
  ]);
  await page.close();
});

test("Mobile: echte 390px-Ansicht, Navigation und Rechnungsdialog", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mockStudioSupabase(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}/admin/`);
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  const menuButton = page.getByRole("button", { name: "Menü öffnen" });
  await menuButton.click();
  await expect(page.locator("#admin-shell")).toHaveClass(/nav-open/);
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#sidebar")).toBeVisible();
  await expect(page.locator('.nav-link[data-view="dashboard"]')).toBeFocused();
  await page.locator("#logout-button").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#sidebar .brand")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#logout-button")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(menuButton).toBeFocused();
  await menuButton.click();
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

test("Mobile: Portal-Anfragen bleiben als handlungsfähige Karten erreichbar", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mockStudioSupabase(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}/admin/`);
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.locator('.nav-link[data-view="portal-requests"]').click();
  const card = page.locator(".portal-request-card").filter({ hasText: "Studio Nord" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Lea Meier");
  await expect(card.getByRole("button", { name: "Akzeptieren" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Ablehnen" })).toBeVisible();
  await expect(page.locator(".data-table")).toBeHidden();
  const actionMetrics = await card.getByRole("button", { name: "Akzeptieren" }).evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
  expect(actionMetrics.height).toBeGreaterThanOrEqual(44);
  await assertHealthy(page, errors);
  await page.close();
});

test("Login: ein Owner mit Kundenmitgliedschaft landet im HEAV Studio", async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `const result = (data) => ({ data, error: null });
      export function createClient() {
        return {
          auth: { getSession: async () => ({ data: { session: { user: { id: "owner-test" } } }, error: null }) },
          from(table) {
            const builder = {
              select() { return builder; },
              eq() { return builder; },
              maybeSingle: async () => result(table === "company_settings" ? { owner_id: "owner-test" } : null),
              limit: async () => result(table === "customer_portal_memberships" ? [{ id: "membership-test" }] : [])
            };
            return builder;
          }
        };
      }`,
    });
  });
  await page.goto(`${base}/login/`);
  await page.waitForURL(/\/studio\/$/);
});

test("Login: sendet einen Magic-Link nur für bestehende Benutzer und ohne Vorschau", async ({ page }) => {
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
  await expect(page).toHaveTitle("Sign in – HEAV Studio");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByLabel("Email").fill("admin@heav.ch");
  await page.getByRole("button", { name: /Send sign-in link/ }).click();
  await expect.poll(() => page.evaluate(() => window.__heavOtpPayload)).toEqual({
    email: "admin@heav.ch",
    options: { emailRedirectTo: `${base}/login/`, shouldCreateUser: false },
  });
  await expect(page.getByText(/Sign-in link sent/)).toBeVisible();
  await expect(page.locator("#login-message")).toHaveClass(/is-dispatch-success/);
  await expect(page.locator("#login-message .send-plane")).toBeVisible();
  await expect(page.locator("#login-message .send-check")).toBeVisible();
  await expect(page.getByText(/Vorschau|Musterrechnung/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /installieren/i })).toHaveCount(0);
});

test("Studio: Rechnungen, Kunden und Projekte verwenden klare Icon-Aktionen", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.locator('.nav-link[data-view="customers"]').click();
  const customerRow = page.locator(".data-table tbody tr").first();
  await expect(customerRow.locator(".customer-contact svg")).toBeVisible();
  const edit = customerRow.getByRole("button", { name: "Bearbeiten" });
  await expect(edit.locator("svg")).toBeVisible();
  await expect(edit).toHaveAttribute("title", "Bearbeiten");
  const editBounds = await edit.boundingBox();
  expect(editBounds.width).toBeGreaterThanOrEqual(38);
  expect(editBounds.height).toBeGreaterThanOrEqual(38);
  await page.locator('.nav-link[data-view="invoices"]').click();
  const invoiceRow = page.locator(".data-table tbody tr").first();
  await expect(invoiceRow.getByRole("button", { name: "Rechnung senden" }).locator("svg")).toBeVisible();
  const actionLayout = await invoiceRow.locator(".table-actions").evaluate((toolbar) => {
    const buttons = [...toolbar.querySelectorAll("button")].map((button) => button.getBoundingClientRect());
    return {
      display: getComputedStyle(toolbar).display,
      flexWrap: getComputedStyle(toolbar).flexWrap,
      actionTopSpread: Math.max(...buttons.map(({ top }) => top)) - Math.min(...buttons.map(({ top }) => top)),
    };
  });
  expect(actionLayout.display).toBe("inline-flex");
  expect(actionLayout.flexWrap).toBe("nowrap");
  expect(actionLayout.actionTopSpread).toBeLessThanOrEqual(1);
  await page.close();
});
test("Studio: Projekt-Canvas verbindet Produktion, Kunde und Finanzschritte", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await mockStudioSupabase(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}/studio/`);
  await page.locator('.nav-link[data-view="projects"]').click();
  const canvas = page.locator(".project-canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toContainText("Brand Film 2026");
  await expect(canvas).toContainText("CHF 9’188.50");
  await page.locator('[data-project-focus="p2"]').first().click();
  await expect(canvas).toContainText("Campaign Content");
  await expect(canvas).toContainText("Atelier Morgen");
  await canvas.locator('[data-create="invoice"]').click();
  await expect(page.getByRole("heading", { name: "Rechnung erstellen" })).toBeVisible();
  await expect(page.locator('select[name="customer_id"]')).toHaveValue("c2");
  await expect(page.locator('select[name="project_id"]')).toHaveValue("p2");
  await page.getByRole("button", { name: "Dialog schliessen" }).click();
  await assertHealthy(page, errors);
  await page.screenshot({ path: "qa/admin-project-canvas-desktop.png", fullPage: true });
  await page.close();
});

test("Studio: Projekt-Canvas bleibt in echter 390px-Ansicht vollständig bedienbar", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mockStudioSupabase(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}/studio/`);
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.locator('.nav-link[data-view="projects"]').click();
  await expect(page.locator("#admin-shell")).not.toHaveClass(/nav-open/);
  await page.waitForTimeout(350);
  const canvas = page.locator(".project-canvas");
  await expect(canvas).toBeVisible();
  const metrics = await canvas.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  const action = canvas.locator('[data-create="invoice"]');
  const box = await action.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await assertHealthy(page, errors);
  await page.screenshot({ path: "qa/admin-project-canvas-mobile.png", fullPage: true });
  await page.close();
});


test("Studio: Offerte wird erstellt und per geschütztem Portal-Link versendet", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await mockStudioSupabase(page);
  await page.goto(`${base}/studio/`);
  await page.locator('.nav-link[data-view="offers"]').click();
  await expect(page.getByRole("heading", { name: "Offerten" })).toBeVisible();
  await page.getByRole("button", { name: /Neue Offerte/ }).click();
  await page.locator('select[name="customer_id"]').selectOption("c1");
  await page.getByLabel("Titel *").fill("Social Cutdowns");
  await page.locator(".invoice-item").first().getByLabel("Leistung").fill("Schnitt");
  await page.locator(".invoice-item").first().getByLabel("Einzelpreis in CHF").fill("1200");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Social Cutdowns")).toBeVisible();
  await page.getByRole("button", { name: "Offerte per E-Mail senden" }).first().click();
  await page.getByRole("button", { name: "Jetzt senden" }).click();
  await expect.poll(() => page.evaluate(() => window.__lastOfferEmail)).toMatchObject({ offerId: expect.any(String) });
  await expect(page.locator(".data-table tbody tr").first()).toContainText("Versendet");
  await page.close();
});

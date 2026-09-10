import { test, expect } from "@playwright/test";

const base = "http://127.0.0.1:4180";

async function mockPortalSupabase(page) {
  await page.route("https://bkazlpqjvbuhwmjcwexn.supabase.co/functions/v1/invoice-document", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\n% HEAV preview\n%%EOF" });
  });
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `const store = {
        customer_portal_memberships: [{ customer_id: "customer-1", role: "client" }],
        projects: [],
        invoices: [{ id: "invoice-1", invoice_number: "HEAV-2026-101", due_date: "2026-10-10", total_rappen: 49500, status: "sent" }],
        customer_files: [],
        offers: []
      };
      const result = (data) => ({ data, error: null });
      export function createClient() {
        return {
          auth: {
            getSession: async () => ({ data: { session: { access_token: "client-test", user: { id: "client-test", user_metadata: {} } } }, error: null }),
            signOut: async () => result(null)
          },
          from(table) {
            const builder = {
              select() { return builder; },
              eq() { return builder; },
              order: async () => result(store[table] || []),
              then(resolve) { return Promise.resolve(result(store[table] || [])).then(resolve); }
            };
            return builder;
          },
          storage: { from: () => ({ createSignedUrl: async () => result(null) }) },
          rpc: async () => result(null)
        };
      }`,
    });
  });
}

test("Kundenportal: Rechnungs-PDF bleibt als Vorschau im Portal", async ({ page }) => {
  await mockPortalSupabase(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  await page.goto(`${base}/client/`);
  await expect(page.getByText("HEAV-2026-101")).toBeVisible();
  await page.getByRole("button", { name: "Vorschau" }).click();

  const dialog = page.locator("#invoice-preview-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "HEAV-2026-101" })).toBeVisible();
  await expect(page.locator("#invoice-preview-frame")).toHaveAttribute("src", /^blob:/);
  await page.screenshot({ path: "qa/client-invoice-preview.png" });
  await expect(page).toHaveURL(`${base}/client/`);

  const metrics = await page.evaluate(() => ({
    innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.clientWidth).toBe(metrics.innerWidth);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);

  await dialog.getByRole("button", { name: "PDF-Vorschau schliessen" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#invoice-preview-frame")).not.toHaveAttribute("src", /.+/);
  expect(errors).toEqual([]);
});

test("Kundenportal: PDF-Vorschau bleibt auf einem echten Mobil-Viewport vollständig bedienbar", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mockPortalSupabase(page);
  await page.goto(`${base}/client/`);
  await page.getByRole("button", { name: "Vorschau" }).click();

  const dialog = page.locator("#invoice-preview-dialog");
  await expect(dialog).toBeVisible();
  const [dialogBox, metrics] = await Promise.all([
    dialog.boundingBox(),
    page.evaluate(() => ({ innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })),
  ]);
  expect(dialogBox.width).toBe(390);
  expect(metrics.clientWidth).toBe(390);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(390);
  await expect(dialog.getByRole("button", { name: "PDF herunterladen" })).toBeEnabled();
  await page.close();
});

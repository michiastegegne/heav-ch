import { test, expect } from "@playwright/test";

const base = "http://127.0.0.1:4180";

async function mockLoggedOutSupabase(page) {
  await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm", async (route) => {
    await route.fulfill({ contentType: "application/javascript", body: `export function createClient(){return {auth:{getSession:async()=>({data:{session:null},error:null})}}}` });
  });
}

test("Login zeigt nur den authentifizierten Zugang", async ({ page }) => {
  await mockLoggedOutSupabase(page);
  await page.goto(`${base}/login/`);
  await expect(page.getByRole("button", { name: /Anmeldelink senden/ })).toBeVisible();
  await expect(page.getByText(/Vorschau|Musterrechnung/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /installieren/i })).toHaveCount(0);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
});

test("Öffentliche Preview- und Demo-Parameter führen ohne Sitzung zum Login", async ({ page }) => {
  await mockLoggedOutSupabase(page);
  for (const query of ["preview=1", "demo=1"]) {
    await page.goto(`${base}/admin/?${query}`);
    await expect(page).toHaveURL(`${base}/login/`);
    await expect(page.getByRole("heading", { name: /Welcome/i })).toBeVisible();
  }
});

test("Cleanup-Service-Worker entfernt alte HEAV-Caches, aber keine fremden Caches", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/login/`);
  await page.evaluate(async () => {
    const old = await caches.open("heav-studio-v2");
    await old.put("/admin/?preview=1", new Response("old preview"));
    const foreign = await caches.open("other-site-cache");
    await foreign.put("/unrelated-resource", new Response("keep"));
    await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
  });
  await expect.poll(() => page.evaluate(async () => await caches.keys())).toEqual(["other-site-cache"]);
  await context.close();
});

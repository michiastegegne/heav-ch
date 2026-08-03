import { test, expect } from "@playwright/test";

const base = "http://127.0.0.1:4179";

test("Mac/Desktop: Installation ist direkt auffindbar und erklärt", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${base}/login/`);
  const install = page.getByRole("button", { name: "HEAV App installieren" });
  await expect(install).toBeVisible();
  const box = await install.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await install.click();
  const dialog = page.getByRole("dialog", { name: "HEAV installieren" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Zum Dock hinzufügen");
  await expect(dialog).toContainText("Zum Home-Bildschirm");
  await page.getByRole("button", { name: "Installationshinweise schliessen" }).click();
  await expect(dialog).not.toBeVisible();
  await page.close();
});

test("Mobile: Installationsoberfläche passt in eine echte 390px-Ansicht", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(`${base}/login/`);
  await page.getByRole("button", { name: "HEAV App installieren" }).click();
  const dialog = page.getByRole("dialog", { name: "HEAV installieren" });
  await expect(dialog).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  const metrics = await page.evaluate(() => ({
    innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics).toEqual({ innerWidth: 390, clientWidth: 390, scrollWidth: 390 });
  await page.screenshot({ path: "qa/pwa-install-mobile.png" });
  await page.close();
});

test("Service Worker speichert nur die feste öffentliche App-Shell", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/`);
  await page.evaluate(async () => {
    const foreign = await caches.open("other-site-cache");
    await foreign.put("/unrelated-resource", new Response("keep"));
  });

  await page.goto(`${base}/login/`, { waitUntil: "networkidle" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload({ waitUntil: "networkidle" });
  }

  await page.goto(`${base}/login/?code=never-cache-this`, { waitUntil: "domcontentloaded" });
  await page.goto(`${base}/admin/?customer=never-cache-this`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => fetch("/admin/assets/app.js?secret=never-cache-this"));
  await page.waitForTimeout(100);

  const inventory = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = [];
    for (const name of names) {
      const cache = await caches.open(name);
      urls.push(...(await cache.keys()).map((request) => request.url));
    }
    return { names, urls };
  });
  expect(inventory.names).toContain("other-site-cache");
  expect(inventory.urls.some((url) => url.includes("never-cache-this"))).toBe(false);
  await context.close();
});

test("Offline: die installierte Designvorschau startet aus dem App-Shell-Cache", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/admin/?preview=1`);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
    }
  });
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  await expect(page.locator("#connection-label")).toContainText("Vorschau");
  await page.locator('.nav-link[data-view="invoices"]').click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-invoice-action="download"]:visible').first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("HEAV-2026-004.pdf");
  await context.setOffline(false);
  await context.close();
});

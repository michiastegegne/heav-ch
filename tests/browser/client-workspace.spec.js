import { test, expect } from '@playwright/test';
import { assertDarkTheme } from './theme-assertions.js';
const base = process.env.HEAV_QA_BASE || 'http://127.0.0.1:4180';

async function fixture(page, { offers = true, invoices = true, empty = false, multi = false, failCustomerId = "" } = {}) {
  const store = {
    customer_portal_memberships: multi ? [{ id: 'membership-1', customer_id: 'customer-1', department_id: 'department-1', role: 'client' }, { id: 'membership-2', customer_id: 'customer-2', department_id: 'department-2', role: 'client' }] : [{ id: 'membership-1', customer_id: 'customer-1', department_id: 'department-1', role: 'client' }],
    customer_departments: [{ id: 'department-1', customer_id: 'customer-1', name: 'Berufsbildung' }, ...(multi ? [{ id: 'department-2', customer_id: 'customer-2', name: 'Jugend' }] : [])],
    projects: empty ? [] : [{ id: 'project-1', customer_id: 'customer-1', department_id: 'department-1', title: 'Eventfilm – ein gemeinsamer Auftritt', description: 'Konzept und Filmproduktion für das Event.', status: 'active', start_date: '2026-09-20', due_date: '2026-10-10' }, ...(multi ? [{ id: 'project-2', customer_id: 'customer-2', department_id: 'department-2', title: 'Beta Kampagne', description: 'Zweite Kundenproduktion.', status: 'planning', start_date: '2026-09-21', due_date: '2026-10-11' }] : [])],
    invoices: invoices && !empty ? [{ id: 'invoice-1', customer_id: 'customer-1', department_id: 'department-1', invoice_number: 'HEAV-2026-101', due_date: '2026-10-10', total_rappen: 49500, status: 'sent' }, ...(multi ? [{ id: 'invoice-2', customer_id: 'customer-2', department_id: 'department-2', invoice_number: 'HEAV-2026-102', due_date: '2026-10-11', total_rappen: 65000, status: 'sent' }] : [])] : [],
    offers: offers && !empty ? [{ id: 'offer-1', customer_id: 'customer-1', department_id: 'department-1', offer_number: '2026-010', title: 'Eventfilm mit Social-Media-Versionen', status: 'sent', valid_until: '2099-12-31', total_rappen: 49500, terms: 'Eine Korrekturrunde ist enthalten.', offer_items: [{ position: 1, description: 'Konzeption und Produktion des Eventfilms', quantity: 1, unit_price_rappen: 49500 }] }, ...(multi ? [{ id: 'offer-2', customer_id: 'customer-2', department_id: 'department-2', offer_number: '2026-011', title: 'Beta Kampagne', status: 'sent', valid_until: '2099-12-31', total_rappen: 65000, terms: 'Eine Korrekturrunde ist enthalten.', offer_items: [] }] : [])] : [],
    customer_files: empty ? [] : [{ id: 'file-1', customer_id: 'customer-1', department_id: 'department-1', title: 'Finaler Eventfilm', original_filename: 'eventfilm-finale-version.mp4', kind: 'video', download_enabled: true }, ...(multi ? [{ id: 'file-2', customer_id: 'customer-2', department_id: 'department-2', title: 'Beta Dateien', original_filename: 'beta-dateien.zip', kind: 'document', download_enabled: true }] : [])],
  };
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm', route => route.fulfill({ contentType: 'application/javascript', body: `const store = ${JSON.stringify(store)}; const failCustomerId = ${JSON.stringify(failCustomerId)};
    export function createClient() { return {
      auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-only', user: { id: 'client-1', user_metadata: {} } } } }), signOut: async () => ({ error: null }) },
      from(table) { const q = { customerId: null, departmentId: null, ids: null, select() { return q; }, eq(column, value) { if (column === 'customer_id') q.customerId = value; if (column === 'department_id') q.departmentId = value; return q; }, in(column, values) { if (column === 'id') q.ids = values; return q; }, order() { return q; }, then(resolve) { const data = (store[table] || []).filter(item => (!q.customerId || item.customer_id === q.customerId) && (!q.departmentId || item.department_id === q.departmentId) && (!q.ids || q.ids.includes(item.id))); const error = q.customerId === failCustomerId ? new Error('Fixture data error') : null; return new Promise(done => setTimeout(() => done({ data, error }), Number(window.__portalLoadDelay || 0))).then(resolve); } }; return q; },
      rpc: async () => ({ error: null }), storage: { from: () => ({ createSignedUrl: async () => ({ error: new Error('Fixture has no file download') }) }) }
    }; }` }));
}

for (const width of [360, 390, 768, 1440]) {
  test(`Kunden-Arbeitsplatz: nächster Schritt und Navigation bei ${width}px`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await fixture(page);
    await page.goto(`${base}/client/`);
    await expect(page.locator('#portal')).toBeVisible();
    await assertDarkTheme(page);
    await expect(page.locator('#review-customer-field')).not.toBeVisible();
    const action = page.locator('#portal-next-step');
    await expect(action).toContainText('Offerte prüfen');
    await expect(action.getByRole('link')).toHaveAttribute('href', '#offer-offer-1');
    await action.getByRole('link').click();
    await expect(page.locator('#offer-offer-1')).toBeInViewport();
    await page.getByRole('navigation', { name: 'Projektbereiche' }).getByRole('link', { name: 'Dateien' }).click();
    await expect(page.locator('#portal-files')).toBeInViewport();
    const metrics = await page.evaluate(() => ({ width: innerWidth, client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
      nav: [...document.querySelectorAll('.portal-nav a')].map(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })),
      oversized: [...document.querySelectorAll('.project-card,.record,.file-row,.offer-card')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).length }));
    expect(metrics.width).toBe(width); expect(metrics.client).toBe(width); expect(metrics.scroll).toBe(width); expect(metrics.oversized).toBe(0);
    for (const box of metrics.nav) { expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); }
    await page.getByRole('button', { name: /^Offerte annehmen/ }).click();
    const dialog = page.locator('#offer-accept-dialog');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `qa/client-workspace-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
    await page.close();
  });
}

test('Kunden-Arbeitsplatz: Rechnung statt erfundener Aufgabe, leeres Konto bleibt ehrlich', async ({ page }) => {
  await fixture(page, { offers: false });
  await page.goto(`${base}/client/`);
  await expect(page.locator('#portal-next-step')).toContainText('Rechnung ansehen');
  await expect(page.locator('#portal-next-step a')).toHaveAttribute('href', '#invoices-heading');
  await fixture(page, { empty: true });
  await page.reload();
  await expect(page.locator('#portal-next-step')).toContainText('Aktuell nichts zu bestätigen');
  await expect(page.locator('#portal-next-step a')).toHaveCount(0);
});

test('Kunden-Arbeitsplatz: mehrere aktive Kundenkonten können vollständig gewechselt werden', async ({ page }) => {
  await fixture(page, { multi: true });
  await page.goto(`${base}/client/`);
  await expect(page.locator('#portal-customer-switcher')).toBeVisible();
  const selector = page.locator('#portal-customer-select');
  await expect(selector).toHaveValue('membership-1');
  await expect(page.locator('#portal-projects')).toContainText('Eventfilm – ein gemeinsamer Auftritt');
  await expect(page.locator('#portal-projects')).not.toContainText('Beta Kampagne');
  await selector.selectOption('membership-2');
  await expect(selector).toHaveValue('membership-2');
  await expect(page.locator('#portal-projects')).toContainText('Beta Kampagne');
  await expect(page.locator('#portal-projects')).not.toContainText('Eventfilm – ein gemeinsamer Auftritt');
  await expect(page.locator('#portal-invoices')).toContainText('HEAV-2026-102');
  await expect(page.locator('#portal-invoices')).not.toContainText('HEAV-2026-101');
  await expect(page.locator('#portal-offers')).toContainText('Beta Kampagne');
  await expect(page.locator('#portal-offers')).not.toContainText('Eventfilm mit Social-Media-Versionen');
});

test('Kunden-Arbeitsplatz: Kontowechsel zeigt einen zugänglichen Ladezustand', async ({ page }) => {
  await fixture(page, { multi: true });
  await page.goto(`${base}/client/`);
  await page.evaluate(() => { window.__portalLoadDelay = 150; });
  await page.locator('#portal-customer-select').selectOption('membership-2');
  await expect(page.locator('#portal-customer-loading')).toBeVisible();
  await expect(page.locator('#portal')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#portal-customer-loading')).toBeHidden();
  await expect(page.locator('#portal')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#portal-projects')).toContainText('Beta Kampagne');
});

test('Kunden-Arbeitsplatz: fehlgeschlagener Kontowechsel behält den vorherigen Kontext', async ({ page }) => {
  await fixture(page, { multi: true, failCustomerId: 'customer-2' });
  page.on('dialog', dialog => dialog.dismiss());
  await page.goto(`${base}/client/`);
  const selector = page.locator('#portal-customer-select');
  await selector.selectOption('membership-2');
  await expect(selector).toHaveValue('membership-1');
  await expect(page.locator('#portal-projects')).toContainText('Eventfilm – ein gemeinsamer Auftritt');
  await expect(page.locator('#portal-projects')).not.toContainText('Beta Kampagne');
  await expect(page.locator('#portal')).not.toHaveAttribute('aria-busy', 'true');
});


test('Kunden-Arbeitsplatz: Offerten-Deep-Link wählt die richtige Abteilung', async ({ page }) => {
  await fixture(page, { multi: true });
  await page.goto(`${base}/client/?offer=offer-2`);
  await expect(page.locator('#portal-customer-select')).toHaveValue('membership-2');
  await expect(page.locator('#offer-offer-2')).toBeVisible();
});

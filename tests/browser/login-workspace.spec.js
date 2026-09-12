import { test, expect } from '@playwright/test';
import { assertDarkTheme } from './theme-assertions.js';
const base = process.env.HEAV_QA_BASE || 'http://127.0.0.1:4180';
for (const width of [360, 390, 768, 1440]) {
  test(`Studio-Login: kompakter deutscher Einstieg bei ${width}px`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if(response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm', route => route.fulfill({ contentType: 'application/javascript', body: `export function createClient() { return { auth: { getSession: async () => ({ data: { session: null } }), signInWithOtp: async () => ({ error: null }) } }; }` }));
    await page.goto(`${base}/login/`);
    await expect(page.getByRole('heading', { name: 'Dein Studio. Dein Überblick.' })).toBeVisible();
    await assertDarkTheme(page);
    const email = page.getByLabel('E-Mail-Adresse');
    const submit = page.getByRole('button', { name: /Anmeldelink senden/ });
    await expect(submit).toBeInViewport();
    const metrics = await page.evaluate(() => ({ width: innerWidth, client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
      font: parseFloat(getComputedStyle(document.querySelector('input')).fontSize), height: document.querySelector('input').getBoundingClientRect().height }));
    expect(metrics.width).toBe(width); expect(metrics.client).toBe(width); expect(metrics.scroll).toBe(width); expect(metrics.font).toBeGreaterThanOrEqual(16); expect(metrics.height).toBeGreaterThanOrEqual(44);
    expect(await page.locator('.login-card').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await page.screenshot({ path: `qa/login-workspace-${width}.png`, fullPage: true });
    await email.fill('fixture@example.com');
    await submit.click();
    await expect(page.locator('#login-message')).toContainText('Anmeldelink gesendet');
    expect(errors).toEqual([]);
    await page.close();
  });
}

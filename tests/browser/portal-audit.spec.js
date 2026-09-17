import { test, expect } from '@playwright/test';

const base = process.env.HEAV_QA_BASE || 'http://127.0.0.1:4180';
const sdk = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';

// No test is allowed to reach a real auth, storage or mutation endpoint.
test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
});

async function loginFixture(page, { signedIn = true, owner = false } = {}) {
  await page.route(sdk, route => route.fulfill({ contentType: 'application/javascript', body: `
    export function createClient() { return {
      auth: {
        getSession: async () => ({ data: { session: ${signedIn ? "{ user: { id: 'fixture-client' } }" : 'null'} } }),
        signInWithOtp: async (payload) => { window.__otp = payload; return { error: null }; },
        signOut: async () => ({ error: null })
      },
      rpc: async () => ({ data: ${owner}, error: null }),
      from() { const q = { select() { return q; }, eq() { return q; }, limit: async () => ({ data: [{ id: 'membership-1' }], error: null }) }; return q; }
    }; }
  ` }));
  // Assert destination selection without booting an unrelated application fixture.
  await page.route(/\/(client|studio)\/(\?.*)?$/, route => route.fulfill({ contentType: 'text/html', body: '<h1>Fixture destination</h1>' }));
}

test('Login: Offerten-Deep-Link überlebt Anmeldung und Magic-Link-Versand', async ({ page }) => {
  const next = '/client/?offer=offer-2#offer-offer-2';
  const login = `${base}/login/?next=${encodeURIComponent(next)}`;
  await loginFixture(page, { signedIn: false });
  await page.goto(login);
  await page.getByLabel('E-Mail-Adresse').fill('fixture@example.com');
  await page.getByRole('button', { name: /Anmeldelink senden/ }).click();
  await expect(page.locator('#login-message')).toContainText('Anmeldelink gesendet');
  const redirect = new URL(await page.evaluate(() => window.__otp.options.emailRedirectTo));
  expect(redirect.origin).toBe(base);
  expect(redirect.pathname).toBe('/login/');
  expect(redirect.searchParams.get('next')).toBe(next);
  await loginFixture(page);
  await page.goto(redirect.href);
  await expect(page).toHaveURL(`${base}${next}`);
});

for (const next of ['https://evil.example/client/', '//evil.example/client/', '/\\evil.example/client/', '/studio/', '/client/../../studio/', '/client/request/', 'javascript:alert(1)']) {
  test(`Login: fremdes oder nicht freigegebenes next-Ziel wird verworfen (${next})`, async ({ page }) => {
    await loginFixture(page);
    await page.goto(`${base}/login/?next=${encodeURIComponent(next)}`);
    await expect(page).toHaveURL(`${base}/client/`);
  });
}

test('Login: Studio-Owner behält Vorrang vor einem Kunden-Deep-Link', async ({ page }) => {
  await loginFixture(page, { owner: true });
  await page.goto(`${base}/login/?next=${encodeURIComponent('/client/?offer=offer-2')}`);
  await expect(page).toHaveURL(`${base}/studio/`);
});

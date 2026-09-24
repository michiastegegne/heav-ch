import { expect } from '@playwright/test';

async function assertVisibleTextContrast(page, fallback = [10, 10, 10]) {
  const lowContrast = await page.locator('body').evaluate((root, fallbackColor) => {
    const rgb = color => (color.match(/[\d.]+/g) || []).map(Number);
    const blend = (top, bottom) => top.slice(0, 3).map((value, index) => value * (top[3] ?? 1) + bottom[index] * (1 - (top[3] ?? 1)));
    const background = element => {
      if (!element) return fallbackColor;
      const color = rgb(getComputedStyle(element).backgroundColor);
      return (color[3] ?? 1) === 1 ? color : blend(color, background(element.parentElement));
    };
    const luminance = color => color.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    return [...root.querySelectorAll('*')]
      .filter(element => element.getClientRects().length && !element.closest('.sr-only,[hidden],[inert],button:disabled') && [...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()))
      .flatMap(element => {
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        if (style.visibility !== 'visible' || Number(style.opacity) < 1 || rect.width < 3 || rect.height < 3) return [];
        const bg = background(element), fg = blend(rgb(style.color), bg), values = [luminance(bg), luminance(fg)];
        const ratio = (Math.max(...values) + .05) / (Math.min(...values) + .05);
        const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
        return ratio + .05 < (large ? 3 : 4.5) ? [{ text: element.textContent.trim().slice(0, 45), className: element.className, ratio: Math.round(ratio * 100) / 100, color: style.color }] : [];
      }).slice(0, 12);
  }, fallback);
  expect(lowContrast).toEqual([]);
}

async function assertFormControlBoundaries(page) {
  const weakBoundaries = await page.locator('input:not([type="hidden"]),select,textarea').evaluateAll(elements => {
    const rgb = color => (color.match(/[\d.]+/g) || []).map(Number).slice(0, 3);
    const luminance = color => color.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152,.0722][index], 0);
    const ratio = (a, b) => { const values = [luminance(a), luminance(b)]; return (Math.max(...values) + .05) / (Math.min(...values) + .05); };
    return elements.filter(element => element.getClientRects().length).flatMap(element => {
      const style = getComputedStyle(element);
      const contrast = ratio(rgb(style.borderTopColor), rgb(style.backgroundColor));
      return contrast + .05 < 3 ? [{ name: element.getAttribute('name') || element.id, contrast: Math.round(contrast * 100) / 100, border: style.borderTopColor, fill: style.backgroundColor }] : [];
    });
  });
  expect(weakBoundaries).toEqual([]);
}

export async function assertDarkTheme(page) {
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(10, 10, 10)');
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(250, 250, 250)');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');

  const cards = page.locator('.login-card,.portal-account-switcher,.portal-next-step,.project-card,.offer-card,.record,.file-row,.portal-request-page .feedback-section');
  for (const card of await cards.all()) {
    if (!await card.isVisible()) continue;
    await expect(card).toHaveCSS('background-color', 'rgb(23, 23, 23)');
    await expect(card).toHaveCSS('border-radius', '24px');
  }

  const primary = page.locator('.primary-button:visible,#login-form button:visible').first();
  if (await primary.count()) {
    await expect(primary).toHaveCSS('background-color', 'rgb(250, 250, 250)');
    await expect(primary).toHaveCSS('color', 'rgb(10, 10, 10)');
    await expect(primary).toHaveCSS('border-radius', '18px');
  }

  const controls = page.locator('input:not([type="hidden"]),select,textarea');
  for (const control of await controls.all()) if (await control.isVisible()) await expect(control).toHaveCSS('border-radius', '18px');
  await assertFormControlBoundaries(page);
  await assertVisibleTextContrast(page);
}

export async function assertStudioEditorialTheme(page) {
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(9, 9, 9)');
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(244, 243, 239)');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await expect(page.locator('.workspace')).toHaveCSS('background-color', 'rgb(9, 9, 9)');
  await expect(page.locator('.topbar h1')).toHaveCSS('font-family', /DM Sans/);
  const displayValues = page.locator('.dashboard-revenue-summary > strong,.dashboard-money > strong,.project-module strong');
  for (const value of await displayValues.all()) if (await value.isVisible()) await expect(value).toHaveCSS('font-family', /DM Sans/);

  const cards = page.locator('.dashboard-focus,.dashboard-money,.panel,.settings-card,.empty-state,.mobile-card,.email-templates,.email-log,dialog[open]');
  for (const card of await cards.all()) {
    if (!await card.isVisible()) continue;
    const fullScreenDialog = await card.evaluate(element => element.matches('dialog') && innerWidth < 821);
    if (!fullScreenDialog) await expect(card).toHaveCSS('border-radius', '16px');
  }
  const dashboardCards = page.locator('.dashboard-money,.dashboard-panel');
  for (const card of await dashboardCards.all()) if (await card.isVisible()) await expect(card).toHaveCSS('background-color', 'rgb(18, 18, 20)');

  const controls = page.locator('.primary-action,.secondary-button,input:not([type="hidden"]),select,textarea');
  for (const control of await controls.all()) if (await control.isVisible()) await expect(control).toHaveCSS('border-radius', '9px');
  const filterTabs = page.locator('.invoice-toolbar .filter-tab');
  for (const filterTab of await filterTabs.all()) if (await filterTab.isVisible()) await expect(filterTab).toHaveCSS('border-radius', '999px');
  const primary = page.locator('.primary-action:visible').first();
  if (await primary.count()) {
    await expect(primary).toHaveCSS('background-color', 'rgb(222, 217, 255)');
    await expect(primary).toHaveCSS('color', 'rgb(40, 35, 66)');
  }
  await assertFormControlBoundaries(page);
  await assertVisibleTextContrast(page);
}
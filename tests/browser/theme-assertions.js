import { expect } from '@playwright/test';

export async function assertDarkTheme(page) {
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 18, 20)');
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(237, 239, 242)');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  const brightPanels = await page.locator('.dashboard-focus,.dashboard-money,.panel,.project-canvas,.mobile-card,.login-card,.portal-next-step,.project-card,.offer-card,.record,.file-row,dialog[open],input:not([type="hidden"]),textarea,select').evaluateAll(elements => elements.filter(el => el.getClientRects().length).flatMap(el => {
    const color = getComputedStyle(el).backgroundColor;
    const channels = color.match(/[\d.]+/g)?.map(Number) || [];
    return channels.length >= 3 && (channels.length < 4 || channels[3] > 0.8) && Math.max(...channels.slice(0, 3)) > 85 ? [{ tag: el.tagName, class: el.className, color }] : [];
  }));
  expect(brightPanels).toEqual([]);
  const lowContrast = await page.locator('body').evaluate(root => {
    const rgb = color => (color.match(/[\d.]+/g) || []).map(Number);
    const blend = (top, bottom) => top.slice(0, 3).map((v, i) => v * (top[3] ?? 1) + bottom[i] * (1 - (top[3] ?? 1)));
    const background = el => { if (!el) return [17, 18, 20]; const color = rgb(getComputedStyle(el).backgroundColor); return (color[3] ?? 1) === 1 ? color : blend(color, background(el.parentElement)); };
    const luminance = c => c.slice(0,3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum,v,i) => sum + v * [.2126,.7152,.0722][i], 0);
    return [...root.querySelectorAll('*')].filter(el => el.getClientRects().length && !el.closest('.sr-only,[hidden],button:disabled') && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).flatMap(el => {
      const style = getComputedStyle(el), rect = el.getBoundingClientRect();
      if (style.visibility !== 'visible' || Number(style.opacity) < 1 || rect.width < 3 || rect.height < 3) return [];
      const bg = background(el), fg = blend(rgb(style.color), bg), l = [luminance(bg), luminance(fg)];
      const ratio = (Math.max(...l) + .05) / (Math.min(...l) + .05);
      const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
      return ratio + .05 < (large ? 3 : 4.5) ? [{text:el.textContent.trim().slice(0,45), class:el.className, ratio:Math.round(ratio*100)/100, color:style.color}] : [];
    }).slice(0, 12);
  });
  expect(lowContrast).toEqual([]);
}

export async function assertStudioCanvasTheme(page) {
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(248, 249, 252)');
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(17, 21, 38)');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  await expect(page.locator('.workspace')).toHaveCSS('background-color', 'rgb(248, 249, 252)');

  const surfaces = await page.locator('.dashboard-focus,.dashboard-money,.panel,.project-canvas-head,.project-module,.project-finances,.project-documents,.mobile-card,.settings-card,.data-table,dialog[open]').evaluateAll(elements => elements.filter(el => el.getClientRects().length).map(el => ({
    className: el.className,
    background: getComputedStyle(el).backgroundColor,
    radius: parseFloat(getComputedStyle(el).borderRadius),
    fullScreenEditor: el.matches('.editor-dialog') && innerWidth < 821,
  })));
  expect(surfaces.length).toBeGreaterThan(0);
  expect(surfaces.every(surface => surface.background !== 'rgb(17, 18, 20)' && (surface.radius >= 12 || surface.fullScreenEditor))).toBe(true);

  const lowContrast = await page.locator('body').evaluate(root => {
    const rgb = color => (color.match(/[\d.]+/g) || []).map(Number);
    const blend = (top, bottom) => top.slice(0, 3).map((value, index) => value * (top[3] ?? 1) + bottom[index] * (1 - (top[3] ?? 1)));
    const background = element => {
      if (!element) return [248, 249, 252];
      const color = rgb(getComputedStyle(element).backgroundColor);
      return (color[3] ?? 1) === 1 ? color : blend(color, background(element.parentElement));
    };
    const luminance = color => color.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    return [...root.querySelectorAll('*')].filter(element => element.getClientRects().length && !element.closest('.sr-only,[hidden],button:disabled') && [...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())).flatMap(element => {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      if (style.visibility !== 'visible' || Number(style.opacity) < 1 || rect.width < 3 || rect.height < 3) return [];
      const bg = background(element), fg = blend(rgb(style.color), bg), values = [luminance(bg), luminance(fg)];
      const ratio = (Math.max(...values) + .05) / (Math.min(...values) + .05);
      const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
      return ratio + .05 < (large ? 3 : 4.5) ? [{ text: element.textContent.trim().slice(0, 45), className: element.className, ratio: Math.round(ratio * 100) / 100, color: style.color }] : [];
    }).slice(0, 12);
  });
  expect(lowContrast).toEqual([]);
}

import { test, expect } from '@playwright/test';
const a='44172eb9-89a2-47ad-8fda-b95e36c93270';
const b='0540bbcf-343c-456c-8ac0-d6125fc74b84';
async function login(page){
 await page.goto('/login');
 await page.getByLabel('E-Mail',{exact:true}).fill('owner@example.test');
 await page.getByLabel('Passwort',{exact:true}).fill('test-password');
 await page.getByRole('button',{name:'Anmelden',exact:true}).click();
 await expect(page).toHaveURL(/\/studio$/);
 await expect(page.getByRole('heading',{name:'Übersicht',exact:true})).toBeVisible();
 await expect(page.locator('.hive-kpis button')).toHaveCount(4);
 await expect(page.getByText('Dein Studio auf einen Blick.',{exact:true})).toBeVisible();
}
test('root opens real CRM login; APIs reject anonymous callers and cross-site login',async({page,request})=>{
 await page.goto('/');await expect(page).toHaveURL(/\/login$/);
 expect((await request.get('/api/hive/workspaces')).status()).toBe(401);
 expect((await request.post('/api/auth/session',{headers:{Origin:'https://untrusted.example'},data:{email:'owner@example.test',password:'test-password'}})).status()).toBe(403);
 expect((await request.post('/api/auth/session',{data:{email:'owner@example.test',password:'wrong'}})).status()).toBe(401);
});
test('login, persist customer through API, reload, isolate businesses, logout',async({page,context})=>{
 await login(page);
 const cookies=await context.cookies();
 expect(cookies.some(c=>c.name.includes('auth-token')&&c.httpOnly)).toBeTruthy();
 expect((await page.request.get('/api/hive/customers?workspace=033fe942-b8de-4298-9762-5f23550afbd9')).status()).toBe(403);
 await page.getByRole('navigation').getByRole('button',{name:/Kunden/}).click();
 await expect(page.getByText('Nordkunde',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Kunde hinzufügen',exact:true}).click();
 await page.getByLabel('Firma',{exact:true}).fill('Testkunde aus Formular');
 await page.getByRole('button',{name:/Speichern/}).click();
 await expect(page.getByText('Testkunde aus Formular',{exact:true})).toBeVisible();
 await page.reload();
 await page.getByRole('navigation').getByRole('button',{name:/Kunden/}).click();
 await expect(page.getByText('Testkunde aus Formular',{exact:true})).toBeVisible();
 await page.getByLabel('Business auswählen').selectOption(b);
 await expect(page.getByText('Südkunde',{exact:true})).toBeVisible();
 await expect(page.getByText('Nordkunde',{exact:true})).toHaveCount(0);
 await expect(page.getByText('Testkunde aus Formular',{exact:true})).toHaveCount(0);
 await page.goto('/account');await expect(page.getByRole('heading',{name:'owner@example.test'})).toBeVisible();
 await page.getByRole('button',{name:'Abmelden',exact:true}).click();await expect(page).toHaveURL(/\/login$/);
 expect((await page.request.get('/api/hive/workspaces')).status()).toBe(401);
});
test('late workspace responses cannot overwrite the selected business',async({page})=>{
 await login(page);
 await page.getByRole('navigation').getByRole('button',{name:/Kunden/}).click();
 await page.route(`**/api/hive/customers?workspace=${b}`,async route=>{const response=await route.fetch();await new Promise(r=>setTimeout(r,500));await route.fulfill({response});});
 await page.getByLabel('Business auswählen').selectOption(b);
 await expect(page.getByText('Nordkunde',{exact:true})).toHaveCount(0);
 await page.getByLabel('Business auswählen').selectOption(a);
 await expect(page.getByText('Nordkunde',{exact:true})).toBeVisible();
 await page.waitForTimeout(700);
 await expect(page.getByText('Südkunde',{exact:true})).toHaveCount(0);
 await expect(page.getByText('Nordkunde',{exact:true})).toBeVisible();
});
for(const width of [390,1440])test(`monochrome workspace fits ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:950});await login(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 const button=page.locator('.hsv-nav button.on');
 await expect(button).toHaveCSS('background-color','rgb(237, 237, 237)');
 await page.screenshot({path:`../../outputs/hive-workspace-refined-${width}.png`,fullPage:true,animations:'disabled'});
 await page.getByRole('navigation').getByRole('button',{name:/Kunden/}).click();
 await expect(page.getByText('Nordkunde',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:`../../outputs/hive-customers-refined-${width}.png`,fullPage:true,animations:'disabled'});
});

test('customer lists support search and invoice lists support status filtering',async({page})=>{
 await login(page);
 await page.getByRole('navigation').getByRole('button',{name:/Kunden/}).click();
 await page.getByLabel('Liste durchsuchen').fill('not-a-customer');
 await expect(page.getByText('Nordkunde',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Suche leeren'}).click();
 await expect(page.getByText('Nordkunde',{exact:true})).toBeVisible();
 await page.getByRole('navigation').getByRole('button',{name:'Rechnungen',exact:true}).click();
 await expect(page.getByText('TEST-2026-001',{exact:true})).toBeVisible();
 await page.getByLabel('Status filtern').selectOption('paid');
 await expect(page.getByText('TEST-2026-001',{exact:true})).toHaveCount(0);
 await expect(page.getByText('TEST-2026-003',{exact:true})).toBeVisible();
});

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
test('active business persists only when the stored workspace is still allowed',async({page})=>{
 await login(page);
 await page.getByLabel('Business auswählen').selectOption(b);
 await expect(page.getByLabel('Business auswählen')).toHaveValue(b);
 await page.reload();
 await expect(page.getByLabel('Business auswählen')).toHaveValue(b);
 await page.getByRole('navigation').getByRole('button',{name:'Kunden',exact:true}).click();
 await expect(page.getByText('Südkunde',{exact:true})).toBeVisible();

 await page.evaluate(() => localStorage.setItem('hive.activeWorkspace.v2','033fe942-b8de-4298-9762-5f23550afbd9'));
 await page.reload();
 await expect(page.getByLabel('Business auswählen')).toHaveValue(a);
 await page.getByRole('navigation').getByRole('button',{name:'Kunden',exact:true}).click();
 await expect(page.getByText('Nordkunde',{exact:true})).toBeVisible();
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
 await page.addInitScript(() => localStorage.setItem('hive-appearance','light'));
 await page.setViewportSize({width,height:950});await login(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 const button=page.locator('.hsv-nav button.on');
 await expect(button).toHaveCSS('background-color','rgb(255, 255, 255)');
 await page.screenshot({path:`../../outputs/hive-workspace-refined-${width}.png`,fullPage:true,animations:'disabled'});
 await page.getByRole('navigation').getByRole('button',{name:/Kunden/}).click();
 await expect(page.getByText('Nordkunde',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:`../../outputs/hive-customers-refined-${width}.png`,fullPage:true,animations:'disabled'});
});

test('mobile-only subnavigation stays hidden on desktop',async({page})=>{
 await page.setViewportSize({width:1440,height:950});
 await login(page);
 const nav=page.getByRole('navigation',{name:'Business-Module'});
 await nav.getByRole('button',{name:'Portal',exact:true}).click();
 await expect(page.getByRole('tablist',{name:'Portal-Bereiche'})).toBeHidden();
 await nav.getByRole('button',{name:'E-Mail',exact:true}).click();
 await expect(page.getByRole('tablist',{name:'E-Mail-Bereiche'})).toBeHidden();
 await nav.getByRole('button',{name:'Business',exact:true}).click();
 await expect(page.getByRole('tablist',{name:'Business-Einstellungen'})).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

test('businesses overview only exposes memberships and opens the selected business',async({page})=>{
 await page.setViewportSize({width:1440,height:950});
 await login(page);

 const response=await page.request.get('/api/hive/businesses/overview');
 expect(response.status()).toBe(200);
 const payload=await response.json();
 expect(payload.businesses.map((item)=>item.id).sort()).toEqual([a,b].sort());
 const north=payload.businesses.find((item)=>item.id===a);
 expect(north.customerCount).toBeGreaterThanOrEqual(1);
 expect(north.projectCount).toBe(2);
 expect(north.openRappen).toBe(680000);
 expect(north.paidRappen).toBe(1280000);
 expect(north.pipelineRappen).toBe(240000);

 const nav=page.getByRole('navigation',{name:'Business-Module'});
 await nav.getByRole('button',{name:'Businesses',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Businesses',exact:true})).toBeVisible();
 const southCard=page.locator('.hive-business-card').filter({hasText:'Studio Süd'}).first();
 await expect(southCard).toBeVisible();
 await southCard.getByRole('button',{name:'Business öffnen',exact:true}).click();
 await expect(page.getByLabel('Business auswählen')).toHaveValue(b);
 await expect(page.getByRole('heading',{name:'Übersicht',exact:true})).toBeVisible();
});

test('invoice duplication creates a new draft without reusing the issued number',async({page})=>{
 await login(page);
 const response=await page.request.post('/api/hive/invoices/30000000-0000-4000-8000-000000000001/action',{
   data:{action:'duplicate',issueDate:'2026-10-16',dueDate:'2026-11-15'}
 });
 expect(response.status()).toBe(201);
 const payload=await response.json();
 expect(payload.ok).toBe(true);
 expect(payload.invoice.invoice_id).toBe('30000000-0000-4000-8000-000000000099');
 expect(payload.invoice.invoice_number).toBe('ENTWURF-30000000');
});

test('invoice email retry survives a lost browser response and clears the key only after success',async({page})=>{
 await login(page);
 const sendBodies=[];
 let attempt=0;
 await page.route('**/api/hive/invoices/30000000-0000-4000-8000-000000000002/action',async route=>{
   const request=route.request();
   if(request.method()!=='POST')return route.continue();
   const body=request.postDataJSON();
   if(body.action!=='send')return route.continue();
   sendBodies.push(body);
   attempt+=1;
   if(attempt===1){
     await new Promise(resolve=>setTimeout(resolve,120));
     return route.abort('failed');
   }
   return route.fulfill({
     status:200,
     contentType:'application/json',
     body:JSON.stringify({ok:true}),
   });
 });

 await page.getByRole('navigation',{name:'Business-Module'}).getByRole('button',{name:'Rechnungen',exact:true}).click();
 const row=page.locator('.hive-invoice-table>div').filter({hasText:'TEST-2026-002'}).first();
 const sendButton=row.getByRole('button',{name:'Rechnung per E-Mail senden',exact:true});

 await sendButton.click();
 await expect(sendButton).toBeDisabled();
 await expect(sendButton).toHaveText('Wird gesendet …');
 await expect(page.getByRole('status')).toContainText('denselben sicheren Versandauftrag');
 await expect(sendButton).toBeEnabled();
 expect(sendBodies).toHaveLength(1);
 const firstKey=sendBodies[0].requestKey;
 expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i);
 expect(await page.evaluate((invoiceId)=>sessionStorage.getItem(`hive.invoiceSendRequest.${invoiceId}`),'30000000-0000-4000-8000-000000000002')).toBe(firstKey);

 await sendButton.click();
 await expect(page.getByRole('status')).toContainText('Rechnung per E-Mail versendet.');
 expect(sendBodies).toHaveLength(2);
 expect(sendBodies[1].requestKey).toBe(firstKey);
 expect(await page.evaluate((invoiceId)=>sessionStorage.getItem(`hive.invoiceSendRequest.${invoiceId}`),'30000000-0000-4000-8000-000000000002')).toBeNull();
});

test('invoice history is workspace scoped and visible from the invoice list',async({page})=>{
 await login(page);
 const foreign=await page.request.get('/api/hive/invoices/30000000-0000-4000-8000-000000000001/history?workspace=033fe942-b8de-4298-9762-5f23550afbd9');
 expect(foreign.status()).toBe(403);

 await page.getByRole('navigation').getByRole('button',{name:'Rechnungen',exact:true}).click();
 const invoiceRow=page.locator('.hive-invoice-table>div').filter({hasText:'TEST-2026-001'}).first();
 await expect(invoiceRow).toBeVisible();
 await invoiceRow.getByRole('button',{name:/Verlauf/}).click();

 const dialog=page.getByRole('dialog',{name:'TEST-2026-001'});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByText('Rechnung ausgestellt',{exact:true})).toBeVisible();
 await expect(dialog.getByText('Rechnung versendet',{exact:true})).toBeVisible();
 await expect(dialog.getByText('Status: Überfällig',{exact:true})).toBeVisible();
 await dialog.getByText(/Versandtechnik/).click();
 await expect(dialog.getByText('Erfolgreich',{exact:true})).toBeVisible();
});

test('offer duplication creates a fresh numbered offer',async({page})=>{
 await login(page);
 const response=await page.request.post('/api/hive/offers/50000000-0000-4000-8000-000000000001',{
   data:{action:'duplicate',issueDate:'2026-10-16',validUntil:'2026-11-15'}
 });
 expect(response.status()).toBe(201);
 const payload=await response.json();
 expect(payload.ok).toBe(true);
 expect(payload.offer.offer_id).toBe('50000000-0000-4000-8000-000000000099');
 expect(payload.offer.offer_number).toBe('TEST-O-2026-099');
});

test('offer email retries reuse the same durable request key across reloads',async({page})=>{
 await login(page);
 const sendBodies=[];
 await page.route('**/api/hive/offers/50000000-0000-4000-8000-000000000001',async route=>{
   const request=route.request();
   if(request.method()!=='POST')return route.continue();
   const body=request.postDataJSON();
   if(body.action!=='send')return route.continue();
   sendBodies.push(body);
   await new Promise(resolve=>setTimeout(resolve,180));
   await route.fulfill({
     status:503,
     contentType:'application/json',
     body:JSON.stringify({error:'Fixture mail transport unavailable'}),
   });
 });

 const nav=page.getByRole('navigation',{name:'Business-Module'});
 await nav.getByRole('button',{name:'Offerten',exact:true}).click();
 let offerRow=page.locator('.hive-offer-table>div').filter({hasText:'OFF-2026-001'}).first();
 let sendButton=offerRow.getByRole('button',{name:'Offerte per E-Mail senden',exact:true});
 await sendButton.click();
 await expect(sendButton).toBeDisabled();
 await expect(sendButton).toHaveText('Wird gesendet …');
 await expect(page.getByRole('status')).toContainText('denselben sicheren Versandauftrag');
 await expect(sendButton).toBeEnabled();
 expect(sendBodies).toHaveLength(1);
 expect(sendBodies[0].requestKey).toMatch(/^[0-9a-f-]{36}$/i);

 const firstKey=sendBodies[0].requestKey;
 expect(await page.evaluate((offerId)=>sessionStorage.getItem(`hive.offerSendRequest.${offerId}`),'50000000-0000-4000-8000-000000000001')).toBe(firstKey);

 await page.reload();
 await page.getByRole('navigation',{name:'Business-Module'}).getByRole('button',{name:'Offerten',exact:true}).click();
 offerRow=page.locator('.hive-offer-table>div').filter({hasText:'OFF-2026-001'}).first();
 sendButton=offerRow.getByRole('button',{name:'Offerte per E-Mail senden',exact:true});
 await sendButton.click();
 await expect(page.getByRole('status')).toContainText('denselben sicheren Versandauftrag');
 expect(sendBodies).toHaveLength(2);
 expect(sendBodies[1].requestKey).toBe(firstKey);
});

test('offer email retry survives a lost browser response and clears the key only after success',async({page})=>{
 await login(page);
 const sendBodies=[];
 let attempt=0;
 await page.route('**/api/hive/offers/50000000-0000-4000-8000-000000000001',async route=>{
   const request=route.request();
   if(request.method()!=='POST')return route.continue();
   const body=request.postDataJSON();
   if(body.action!=='send')return route.continue();
   sendBodies.push(body);
   attempt+=1;
   if(attempt===1){
     await new Promise(resolve=>setTimeout(resolve,120));
     return route.abort('failed');
   }
   return route.fulfill({
     status:200,
     contentType:'application/json',
     body:JSON.stringify({ok:true,recipient:'anna@example.test'}),
   });
 });

 const nav=page.getByRole('navigation',{name:'Business-Module'});
 await nav.getByRole('button',{name:'Offerten',exact:true}).click();
 const offerRow=page.locator('.hive-offer-table>div').filter({hasText:'OFF-2026-001'}).first();
 const sendButton=offerRow.getByRole('button',{name:'Offerte per E-Mail senden',exact:true});

 await sendButton.click();
 await expect(sendButton).toBeDisabled();
 await expect(page.getByRole('status')).toContainText('denselben sicheren Versandauftrag');
 await expect(sendButton).toBeEnabled();
 expect(sendBodies).toHaveLength(1);
 const firstKey=sendBodies[0].requestKey;
 expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i);
 expect(await page.evaluate((offerId)=>sessionStorage.getItem(`hive.offerSendRequest.${offerId}`),'50000000-0000-4000-8000-000000000001')).toBe(firstKey);

 await sendButton.click();
 await expect(page.getByRole('status')).toContainText('Offerte per E-Mail versendet.');
 expect(sendBodies).toHaveLength(2);
 expect(sendBodies[1].requestKey).toBe(firstKey);
 expect(await page.evaluate((offerId)=>sessionStorage.getItem(`hive.offerSendRequest.${offerId}`),'50000000-0000-4000-8000-000000000001')).toBeNull();
});

test('offer history is workspace scoped and visible from the offer list',async({page})=>{
 await login(page);
 const foreign=await page.request.get('/api/hive/offers/50000000-0000-4000-8000-000000000001/history?workspace=033fe942-b8de-4298-9762-5f23550afbd9');
 expect(foreign.status()).toBe(403);

 const nav=page.getByRole('navigation',{name:'Business-Module'});
 await nav.getByRole('button',{name:'Offerten',exact:true}).click();
 const offerRow=page.locator('.hive-offer-table>div').filter({hasText:'OFF-2026-001'}).first();
 await expect(offerRow).toBeVisible();
 await offerRow.getByRole('button',{name:/Verlauf/}).click();

 const dialog=page.getByRole('dialog',{name:'OFF-2026-001'});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByText('Offerte erstellt',{exact:true})).toBeVisible();
 await expect(dialog.getByText('Im Kundenportal freigegeben',{exact:true})).toBeVisible();
 await expect(dialog.getByText('Offerte versendet',{exact:true})).toBeVisible();
 await dialog.getByText(/Versandtechnik/).click();
 await expect(dialog.getByText('Erfolgreich',{exact:true})).toBeVisible();
});

test('project calendar shows deadlines across months',async({page})=>{
 await login(page);
 await page.getByRole('navigation').getByRole('button',{name:'Projekte',exact:true}).click();
 await page.getByRole('button',{name:'Kalender',exact:true}).click();
 await expect(page.getByRole('button',{name:/Herbstkampagne — Brand Film/}).first()).toBeVisible();
 await page.getByRole('button',{name:'Nächster Monat',exact:true}).click();
 await expect(page.getByRole('button',{name:/Portraits für das neue Team/}).first()).toBeVisible();
});

test('project board persists status changes and keeps the preferred view',async({page})=>{
 await login(page);
 await page.getByRole('navigation').getByRole('button',{name:'Projekte',exact:true}).click();
 await page.getByRole('button',{name:'Board',exact:true}).click();
 await expect(page.locator('.hive-project-column')).toHaveCount(4);

 const status=page.getByLabel('Status für Portraits für das neue Team');
 await expect(status).toHaveValue('planning');
 await status.selectOption('active');
 await expect(status).toHaveValue('active');

 await page.reload();
 await page.getByRole('navigation').getByRole('button',{name:'Projekte',exact:true}).click();
 await expect(page.getByRole('button',{name:'Board',exact:true})).toHaveAttribute('aria-pressed','true');
 const persisted=page.getByLabel('Status für Portraits für das neue Team');
 await expect(persisted).toHaveValue('active');

 await persisted.selectOption('planning');
 await expect(persisted).toHaveValue('planning');
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

for(const width of [390,1440])test(`dark appearance persists across login, reload and forms at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:950});
 await page.goto('/login');
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.getByRole('button',{name:'Hellen Modus aktivieren'}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.reload();
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await login(page);
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.getByRole('button',{name:'Dunklen Modus aktivieren'}).click();
 await page.reload();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await expect(page.locator('.hive-kpis button')).toHaveCount(4);
 await expect(page.locator('.hive-panel').first()).toHaveCSS('background-color','rgb(21, 31, 50)');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await expect(page.getByText('Dein Studio auf einen Blick.',{exact:true})).toBeVisible();
 await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
 await page.screenshot({path:`../../outputs/hive-darkmode-ready-${width}.png`,fullPage:true,animations:'disabled'});
 await page.getByRole('navigation').getByRole('button',{name:/Kunden/}).click();
 await page.getByRole('button',{name:'Kunde hinzufügen',exact:true}).click();
 await expect(page.getByLabel('Firma',{exact:true})).toHaveCSS('background-color','rgb(27, 40, 64)');
 await expect(page.locator('.hsv-dialog')).toHaveCSS('background-color','rgb(21, 31, 50)');
 await page.getByRole('button',{name:'Schliessen',exact:true}).click();
 await page.goto('/account');
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.getByRole('button',{name:'Hellen Modus aktivieren'}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
});

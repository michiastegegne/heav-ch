import {test,expect} from '@playwright/test';
async function login(page){
 await page.goto('/login');await page.getByLabel('E-Mail',{exact:true}).fill('owner@example.test');await page.getByLabel('Passwort',{exact:true}).fill('test-password');await page.getByRole('button',{name:'Anmelden',exact:true}).click();await expect(page.locator('.crm-metrics button')).toHaveCount(4);
}
test('iOS webapp manifest and real raster icons are available',async({request})=>{
 const response=await request.get('/manifest.webmanifest');expect(response.ok()).toBeTruthy();const manifest=await response.json();
 expect(manifest.display).toBe('standalone');expect(manifest.start_url).toBe('/studio');expect(manifest.id).toBe('/');
 for(const size of [180,192,512]){const image=await request.get(`/icons/hive-${size}.png`);expect(image.ok()).toBeTruthy();const data=await image.body();expect(data.readUInt32BE(16)).toBe(size);expect(data.readUInt32BE(20)).toBe(size);}
 const html=await(await request.get('/login')).text();expect(html).toContain('apple-touch-icon');expect(html).toContain('viewport-fit=cover');
});
test('iPhone installation guide is accessible, traps focus and closes back to workspace',async({page})=>{
 await page.setViewportSize({width:390,height:844});await login(page);
 await page.getByRole('navigation',{name:'Mobile Navigation'}).getByRole('button',{name:'Weitere Module'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Als App installieren',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Hive auf deinem iPhone'});await expect(dialog).toBeVisible();await expect(dialog.getByText('Zum Home-Bildschirm',{exact:true})).toBeVisible();
 await page.keyboard.press('Tab');expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBeTruthy();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await page.getByRole('navigation',{name:'Mobile Navigation'}).getByRole('button',{name:'Kunden',exact:true}).click();await expect(page.getByText('Nordkunde',{exact:true})).toBeVisible();
});
for(const theme of ['light','dark'])test(`opaque navigation and overview stay readable on iPhone ${theme}`,async({page})=>{
 await page.addInitScript(mode=>localStorage.setItem('hive-appearance',mode),theme);await page.setViewportSize({width:390,height:844});await login(page);
 const nav=page.getByRole('navigation',{name:'Mobile Navigation'});await expect(nav).toBeVisible();
 expect(await nav.evaluate(node=>getComputedStyle(node).backdropFilter)).toBe('none');
 const values=await page.locator('.hive-kpi-value').evaluateAll(nodes=>nodes.map(node=>({width:node.clientWidth,scroll:node.scrollWidth})));expect(values.every(value=>value.scroll<=value.width)).toBeTruthy();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:`../../outputs/hive-glass-390-${theme}.png`,fullPage:false});
 await page.emulateMedia({reducedMotion:'reduce',contrast:'more'});
 expect(await nav.evaluate(node=>getComputedStyle(node).backdropFilter)).toBe('none');
 await nav.getByRole('button',{name:'Projekte',exact:true}).click();await page.getByRole('button',{name:'Kalender',exact:true}).click();await expect(page.locator('.hive-project-agenda')).toBeVisible();
});
test('glass desktop sidebar and project workspaces preserve real navigation',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await login(page);
 await page.screenshot({path:'../../outputs/hive-glass-1440-dark.png',fullPage:false});
 const nav=page.getByRole('navigation',{name:'Business-Module'});await nav.getByRole('button',{name:'Projekte',exact:true}).click();
 await page.getByRole('button',{name:'Projekt öffnen',exact:true}).first().click();await expect(page.getByRole('dialog',{name:'Workspace Details'})).toBeVisible();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Als App installieren',exact:true}).click();await expect(page.getByRole('dialog',{name:'Hive auf deinem iPhone'})).toBeVisible();
});

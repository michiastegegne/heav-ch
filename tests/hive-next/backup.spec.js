import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {decryptBackup} from '../../hive-next/lib/hive/backup-crypto.mjs';
const a='44172eb9-89a2-47ad-8fda-b95e36c93270';
const b='0540bbcf-343c-456c-8ac0-d6125fc74b84';
async function login(page){
 await page.goto('/login');
 await page.getByLabel('E-Mail',{exact:true}).fill('owner@example.test');
 await page.getByLabel('Passwort',{exact:true}).fill('test-password');
 await page.getByRole('button',{name:'Anmelden',exact:true}).click();
 await expect(page.locator('.hive-kpis button')).toHaveCount(4);
}
test('backup denies anonymous and unavailable workspaces',async({page,request})=>{
 expect((await request.get(`/api/hive/backup?workspace=${a}`)).status()).toBe(401);
 await login(page);
 expect((await page.request.get('/api/hive/backup?workspace=033fe942-b8de-4298-9762-5f23550afbd9')).status()).toBe(403);
 expect((await page.request.post('/api/auth/session',{data:{email:'accountant@example.test',password:'test-password'}})).ok()).toBeTruthy();
 expect((await page.request.get(`/api/hive/backup?workspace=${a}`)).status()).toBe(403);
});
test('backup isolates businesses, downloads encrypted and can be recovered offline',async({page})=>{
 await page.setViewportSize({width:390,height:844}); await login(page);
 const response=await page.request.get(`/api/hive/backup?workspace=${a}`);
 expect(response.status()).toBe(200);
 expect(response.headers()['cache-control']).toContain('no-store');
 const exportData=await response.json();
 expect(exportData.records.customers.every(row=>row.workspace_id===a)).toBeTruthy();
 expect(exportData.counts.customers).toBeGreaterThan(0);
 expect(exportData.counts.products).toBe(501);
 expect(new Set(exportData.records.products.map(row=>row.id)).size).toBe(501);
 expect(exportData.records.customer_portal_invites).toBeUndefined();
 await page.getByRole('navigation',{name:'Mobile Navigation'}).getByRole('button',{name:'Weitere Module'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Business',exact:true}).click();
 const card=page.getByRole('region',{name:'Datensicherung'});
 await card.getByLabel('Sicherungspasswort',{exact:true}).fill('my unique backup passphrase');
 await card.getByLabel('Passwort wiederholen',{exact:true}).fill('my unique backup passphrase');
 await card.screenshot({path:'../../outputs/hive-backup-390-dark.png'});
 const download=page.waitForEvent('download');
 await card.getByRole('button',{name:'Verschlüsselt herunterladen'}).click();
 const file=await download;
 const envelope=JSON.parse(await readFile(await file.path(),'utf8'));
 const recovered=await decryptBackup(envelope,'my unique backup passphrase');
 expect(recovered.workspaceId).toBe(a);
 expect(recovered.records.customers.some(row=>row.company==='Südkunde')).toBeFalsy();
 await expect(card.getByLabel('Sicherungspasswort',{exact:true})).toHaveValue('');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.getByLabel('Business auswählen').selectOption(b);
 await expect(page.getByRole('region',{name:'Datensicherung'}).getByLabel('Sicherungspasswort',{exact:true})).toHaveValue('');
});
test('main business is selected by identity, not membership order; storage failure does not block loading',async({page})=>{
 await page.route('**/api/hive/workspaces',async route=>{
  const response=await route.fetch(); const data=await response.json();
  data.workspaces.find(w=>w.id===a).slug='hive-dev-michias';
  data.workspaces.reverse(); await route.fulfill({response,json:data});
 });
 await page.addInitScript(()=>{const original=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key==='hive.activeWorkspace.v2')throw new Error('disabled');return original.call(this,key);};});
 await login(page); await expect(page.getByLabel('Business auswählen')).toHaveValue(a);
 await expect(page.getByLabel('Business auswählen').locator('option').first()).toHaveText('michias tegegne');
});

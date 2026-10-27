import { navigate, openNavigation } from "./navigation.mjs";
import {test,expect} from '@playwright/test';
async function login(page){
 await page.goto('/login');
 await page.getByLabel('E-Mail',{exact:true}).fill('owner@example.test');
 await page.getByLabel('Passwort',{exact:true}).fill('test-password');
 await page.getByRole('button',{name:'Anmelden',exact:true}).click();
 await expect(page.locator('.crm-metrics button')).toHaveCount(4);
}
test('an email outage does not block projects; retry recovers the module',async({page})=>{
 let unavailable=true;
 await page.route('**/api/hive/emails?*',route=>unavailable?route.fulfill({status:503,json:{error:'E-Mail-Verbindung vorübergehend unterbrochen'}}):route.continue());
 await login(page);
 await expect(page.getByText('Ein Zusatzmodul ist gerade nicht erreichbar.')).toBeVisible();
 await navigate(page,'Projekte');
 await expect(page.getByRole('button',{name:'Projekt öffnen',exact:true}).first()).toBeVisible();
 await page.getByRole('button',{name:'Projekt öffnen',exact:true}).first().click();
 await expect(page.getByRole('dialog',{name:'Workspace Details'})).toBeVisible();
 await page.keyboard.press('Escape');
 unavailable=false;
 await page.getByRole('button',{name:'Verbindung erneut prüfen'}).click();
 await expect(page.getByText('Ein Zusatzmodul ist gerade nicht erreichbar.')).toHaveCount(0);
});
test('a delayed integration does not hold the core workspace loading screen',async({page})=>{
 let release; const gate=new Promise(resolve=>release=resolve);
 await page.route('**/api/hive/portal?*',async route=>{await gate;await route.continue();});
 await login(page);
 await expect(page.getByRole('heading',{name:'Was steht heute an?'})).toBeVisible();
 release();
});
test('module URL survives reload and browser back and forward',async({page})=>{
 await login(page);
 const nav=page.getByRole('navigation',{name:'Business-Module'});
 await navigate(page,'Projekte');
 await expect(page).toHaveURL(/view=projects/);
 await page.reload();
 await expect(page.getByRole('heading',{name:'Projekte',exact:true})).toBeVisible();
 await navigate(page,'Kunden');
 await expect(page).toHaveURL(/view=customers/);
 await page.goBack();
 await expect(page.getByRole('heading',{name:'Projekte',exact:true})).toBeVisible();
 await page.goForward();
 await expect(page.getByRole('heading',{name:'Kunden',exact:true})).toBeVisible();
});
test('disabled browser storage does not crash the workspace or project views',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('Storage disabled')};Storage.prototype.setItem=()=>{throw new Error('Storage disabled')};});
 await login(page);
 await navigate(page,'Projekte');
 await page.getByRole('button',{name:'Board',exact:true}).click();
 await expect(page.locator('.hive-clean-board')).toBeVisible();
 expect(errors).toEqual([]);
});

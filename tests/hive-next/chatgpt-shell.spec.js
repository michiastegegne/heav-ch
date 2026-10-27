import {test,expect} from '@playwright/test';
import {navigate,openNavigation} from './navigation.mjs';
for(const width of [320,390,1440])test(`workspace search and responsive navigation at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto('/login');
 await page.getByLabel('E-Mail',{exact:true}).fill('owner@example.test');
 await page.getByLabel('Passwort',{exact:true}).fill('test-password');
 await page.getByRole('button',{name:'Anmelden',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Was steht heute an?',exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Im Workspace suchen',exact:true}).fill('Nord');
 await page.getByRole('button',{name:'Suche öffnen',exact:true}).click();
 const search=page.getByRole('dialog',{name:'Workspace durchsuchen',exact:true});
 await expect(search.getByText('Nordkunde',{exact:true})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(search).toHaveCount(0);
 await navigate(page,'Kunden');
 await expect(page.getByRole('button',{name:'Nordkunde',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 if(width<=760){
  await openNavigation(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'Navigation',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Menü öffnen',exact:true})).toBeFocused();
 }else{
  await page.getByRole('button',{name:'Seitenleiste schliessen',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Business-Module',exact:true})).toBeHidden();
  await page.getByRole('button',{name:'Seitenleiste öffnen',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Business-Module',exact:true})).toBeVisible();
 }
});

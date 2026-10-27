export async function openNavigation(page) {
 const menu=page.getByRole('button',{name:'Menü öffnen',exact:true});
 if(await menu.isVisible() && !(await page.getByRole('dialog',{name:'Navigation',exact:true}).isVisible())) await menu.click();
 return page.getByRole('navigation',{name:'Business-Module',exact:true});
}
export async function navigate(page,name) {
 const nav=await openNavigation(page);
 await nav.getByRole('button',{name,exact:typeof name==='string'}).click();
}

export async function openAppearance(page){
 const control=page.getByRole('button',{name:'Erscheinungsbild einstellen',exact:true});
 if(!await control.isVisible())await openNavigation(page);
 await control.click();
}

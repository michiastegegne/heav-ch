import { test, expect } from '@playwright/test';
const workspace='44172eb9-89a2-47ad-8fda-b95e36c93270';
test('preview opens without cookies, keeps identity server-side and rejects live workspace IDs',async({page,context,request})=>{
 await page.goto('/login');
 await expect(page).toHaveURL(/\/studio$/);
 await expect(page.locator('.crm-metrics button')).toHaveCount(4);
 expect((await context.cookies()).some(cookie=>cookie.name.includes('auth-token'))).toBe(false);
 const response=await request.get('/api/hive/workspaces');
 expect(response.status()).toBe(200);
 const data=await response.json();
 expect(data.workspaces.length).toBe(2);
 expect(data.workspaces.every(w=>w.slug.startsWith('hive-dev-'))).toBe(true);
 expect(JSON.stringify(data)).not.toContain('access_token');
 for(const route of ['customers','projects','invoices','offers','settings','products','activity','team','emails','portal','backup']) {
  expect((await request.get(`/api/hive/${route}?workspace=033fe942-b8de-4298-9762-5f23550afbd9`)).status(),route).toBe(403);
 }
 expect((await request.get(`/api/hive/customers?workspace=${workspace}`)).status()).toBe(200);
 expect((await request.post('/api/hive/team/invite/claim',{data:{token:'a'.repeat(30)}})).status()).toBe(403);
 expect((await request.post('/api/auth/identity-link',{data:{}})).status()).toBe(403);
});
test('preview blocks email even when email flag is enabled',async({request})=>{
 const invoice=await request.post('/api/hive/invoices/30000000-0000-4000-8000-000000000002/action',{data:{action:'send',requestKey:crypto.randomUUID()}});
 expect(invoice.status()).toBe(403);
 const offer=await request.post('/api/hive/offers/50000000-0000-4000-8000-000000000001',{data:{action:'send',requestKey:crypto.randomUUID()}});
 expect(offer.status()).toBe(403);
});

test('a preview identity that gains live access fails closed for every API',async({request})=>{
 await request.post('http://127.0.0.1:4499/__preview_scope',{data:{live:true}});
 try {
  for(const route of ['workspaces','businesses/overview',`customers?workspace=${workspace}`]) {
   expect((await request.get(`/api/hive/${route}`)).status()).toBe(403);
  }
 } finally { await request.post('http://127.0.0.1:4499/__preview_scope',{data:{live:false}}); }
});

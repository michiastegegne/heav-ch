import http from 'node:http';
const userId = '10000000-0000-4000-8000-000000000001';
const a = '44172eb9-89a2-47ad-8fda-b95e36c93270';
const b = '0540bbcf-343c-456c-8ac0-d6125fc74b84';
const workspaces = [{id:a,name:'Studio Nord',slug:'hive-dev-nord',status:'active'},{id:b,name:'Studio Süd',slug:'hive-dev-sued',status:'active'}];
const user = {id:userId,aud:'authenticated',role:'authenticated',email:'owner@example.test',created_at:new Date().toISOString(),app_metadata:{},user_metadata:{},identities:[]};
const encode = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const token = `${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:userId,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}.test-signature`;
let customers = [{id:'20000000-0000-4000-8000-000000000001',workspace_id:a,company:'Nordkunde',contact_name:'Anna',email:'anna@example.test'},{id:'20000000-0000-4000-8000-000000000002',workspace_id:b,company:'Südkunde',contact_name:'Ben',email:'ben@example.test'}];
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost:4499');
 let raw='';for await(const chunk of req)raw+=chunk;
 const body=raw?JSON.parse(raw):{};
 const reply=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 if(url.pathname==='/health')return reply({ok:true});
 if(url.pathname==='/auth/v1/token')return body.email===user.email&&body.password==='test-password' ? reply({access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user}) : reply({msg:'Invalid login credentials',code:'invalid_credentials'},400);
 if(url.pathname==='/auth/v1/user')return req.headers.authorization===`Bearer ${token}`?reply(user):reply({msg:'Invalid token'},401);
 if(url.pathname==='/auth/v1/logout')return reply({});
 if(url.pathname.startsWith('/rest/v1/rpc/')){
  const name=url.pathname.split('/').pop();
  if(name==='current_app_user_id')return reply(userId);
  if(name==='is_hive_preview_workspace')return reply([a,b].includes(body.p_workspace_id));
  if(name==='is_workspace_member')return reply([a,b].includes(body.p_workspace_id));
  return reply([]);
 }
 const table=url.pathname.split('/').pop();
 const scope=url.searchParams.get('workspace_id')?.replace('eq.','');
 let rows=[];
 if(table==='workspace_memberships'){
  if(url.searchParams.get('user_id')!==`eq.${userId}`)return reply({message:'Membership query must filter current user'},400);
  rows=workspaces.map(w=>({workspace_id:w.id,role:'owner',workspaces:w}));
 }
 if(table==='workspaces')rows=workspaces;
 if(table==='customers'){
  if(req.method==='POST'){const c={id:crypto.randomUUID(),...body};customers.push(c);return reply(c,201);}
  rows=customers.filter(c=>c.workspace_id===scope);
 }
 if(table==='invoices'&&scope===a)rows=[
  {id:'30000000-0000-4000-8000-000000000001',workspace_id:a,customer_id:customers[0].id,invoice_number:'TEST-2026-001',status:'overdue',due_date:'2026-10-10',total_rappen:260000,currency:'CHF',number_finalized:true,is_legacy:true,customers:{company:'Nordkunde'}},
  {id:'30000000-0000-4000-8000-000000000002',workspace_id:a,customer_id:customers[0].id,invoice_number:'TEST-2026-002',status:'sent',due_date:'2026-10-30',total_rappen:420000,currency:'CHF',number_finalized:true,is_legacy:true,customers:{company:'Atelier Seefeld'}},
  {id:'30000000-0000-4000-8000-000000000003',workspace_id:a,customer_id:customers[0].id,invoice_number:'TEST-2026-003',status:'paid',due_date:'2026-09-30',total_rappen:1280000,currency:'CHF',number_finalized:true,is_legacy:true,customers:{company:'Atelier Seefeld'}}];
 if(table==='projects'&&scope===a)rows=[
 {id:'40000000-0000-4000-8000-000000000001',workspace_id:a,customer_id:customers[0].id,title:'Herbstkampagne — Brand Film',status:'active',due_date:'2026-10-28',budget_rappen:420000,customers:{company:'Atelier Seefeld'}},
 {id:'40000000-0000-4000-8000-000000000002',workspace_id:a,customer_id:customers[0].id,title:'Portraits für das neue Team',status:'planning',due_date:'2026-11-04',budget_rappen:180000,customers:{company:'Nordkunde'}}];
 if(table==='workspace_settings')rows=[{workspace_id:scope,business_name:workspaces.find(w=>w.id===scope)?.name,email:'owner@example.test',currency:'CHF',accent_color:'#ff0000',default_tax_rate:0,default_due_days:30}];
 const id=url.searchParams.get('id')?.replace('eq.','');if(id)rows=rows.filter(x=>x.id===id);
 return reply(req.headers.accept?.includes('vnd.pgrst.object')?(rows[0]||null):rows);
}).listen(4499,'127.0.0.1');

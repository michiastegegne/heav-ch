import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const idSchema=z.string().uuid();
const workspaceSchema=z.string().uuid();

const esc=(value:unknown)=>String(value ?? '').replace(/[&<>"']/g,(char)=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
}[char] || char));

const money=(rappen:number,currency:string)=>
  new Intl.NumberFormat('de-CH',{style:'currency',currency}).format((Number(rappen)||0)/100);

export async function GET(
  request:Request,
  context:{params:Promise<{id:string}>},
){
  try{
    const {id}=await context.params;
    const offerId=idSchema.parse(id);
    const workspaceId=workspaceSchema.parse(new URL(request.url).searchParams.get('workspace'));
    const supabase=await requireHiveDataAccess();
    await assertWorkspaceAllowed(workspaceId,supabase);

    const [{data:offer,error:offerError},{data:settings,error:settingsError}]=await Promise.all([
      supabase.from('offers')
        .select('id,workspace_id,customer_id,project_id,offer_number,title,issue_date,valid_until,status,notes,terms,subtotal_rappen,tax_rappen,total_rappen')
        .eq('id',offerId)
        .eq('workspace_id',workspaceId)
        .single(),
      supabase.from('workspace_settings')
        .select('business_name,legal_name,contact_name,email,phone,address_line1,postal_code,city,country,logo_url,currency,uid_number,vat_number,vat_enabled')
        .eq('workspace_id',workspaceId)
        .single(),
    ]);
    if(offerError || !offer) throw offerError || new Error('Offer not found');
    if(settingsError || !settings) throw settingsError || new Error('Workspace settings not found');

    const [{data:customer,error:customerError},{data:items,error:itemsError},{data:project,error:projectError}]=await Promise.all([
      supabase.from('customers')
        .select('company,contact_name,email,address_line1,postal_code,city,country')
        .eq('id',offer.customer_id)
        .eq('workspace_id',workspaceId)
        .single(),
      supabase.from('offer_items')
        .select('position,description,quantity,unit_price_rappen')
        .eq('offer_id',offerId)
        .eq('workspace_id',workspaceId)
        .order('position'),
      offer.project_id
        ? supabase.from('projects')
            .select('title')
            .eq('id',offer.project_id)
            .eq('workspace_id',workspaceId)
            .maybeSingle()
        : Promise.resolve({data:null,error:null}),
    ]);
    if(customerError || !customer) throw customerError || new Error('Customer not found');
    if(itemsError) throw itemsError;
    if(projectError) throw projectError;

    const currency=settings.currency || 'CHF';
    const taxRate=Number(offer.subtotal_rappen)>0
      ? Math.round((Number(offer.tax_rappen)/Number(offer.subtotal_rappen))*10000)/100
      : 0;
    const issuerName=settings.legal_name || settings.business_name;
    const customerName=customer.company || customer.contact_name || 'Kunde';
    const issuerAddress=[settings.address_line1,[settings.postal_code,settings.city].filter(Boolean).join(' '),settings.country].filter(Boolean);
    const customerAddress=[customer.address_line1,[customer.postal_code,customer.city].filter(Boolean).join(' '),customer.country].filter(Boolean);

    const rows=(items ?? []).map((item)=>`
      <tr>
        <td>${esc(item.description)}</td>
        <td class="num">${esc(item.quantity)}</td>
        <td class="num">${esc(money(Number(item.unit_price_rappen),currency))}</td>
        <td class="num">${esc(money(Math.round(Number(item.quantity)*Number(item.unit_price_rappen)),currency))}</td>
      </tr>`).join('');

    const html=`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(offer.offer_number)} · ${esc(offer.title)}</title>
<style>
@page{size:A4;margin:18mm}
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#111;margin:0;background:#f3f3f1}
.sheet{width:210mm;min-height:297mm;margin:20px auto;background:#fff;padding:18mm;box-shadow:0 10px 40px rgba(0,0,0,.12)}
.top{display:flex;justify-content:space-between;gap:30px;align-items:flex-start}
.brand{font-size:26px;font-weight:800;letter-spacing:-.04em}
.logo{max-width:150px;max-height:48px;object-fit:contain;display:block;margin-bottom:14px}
.meta{text-align:right;font-size:12px;line-height:1.6;color:#555}
h1{font-size:44px;line-height:1;margin:54px 0 10px;letter-spacing:-.05em}
.subtitle{font-size:16px;color:#555;margin-bottom:38px}
.addresses{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin:34px 0}
.addresses h3{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#777;margin:0 0 10px}
.addresses p{margin:0;line-height:1.55}
table{width:100%;border-collapse:collapse;margin-top:28px}
th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;text-align:left;border-bottom:1px solid #111;padding:10px 8px}
td{padding:13px 8px;border-bottom:1px solid #ddd;vertical-align:top}
.num{text-align:right;white-space:nowrap}
.totals{width:330px;margin:26px 0 0 auto}
.totals div{display:flex;justify-content:space-between;padding:7px 0}
.totals .grand{font-size:20px;font-weight:800;border-top:1px solid #111;margin-top:7px;padding-top:14px}
.notes{margin-top:46px;display:grid;gap:24px}
.notes h3{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#777;margin:0 0 8px}
.notes p{white-space:pre-wrap;line-height:1.6;margin:0}
.footer{margin-top:60px;padding-top:16px;border-top:1px solid #ddd;font-size:11px;color:#666;display:flex;justify-content:space-between;gap:20px}
.actions{position:fixed;right:24px;bottom:24px}
.actions button{border:0;background:#111;color:#fff;padding:12px 16px;border-radius:8px;font-weight:700;cursor:pointer}
@media print{
  body{background:#fff}
  .sheet{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none}
  .actions{display:none}
}
</style>
</head>
<body>
<main class="sheet">
  <div class="top">
    <div>
      ${settings.logo_url ? `<img class="logo" src="${esc(settings.logo_url)}" alt=""/>` : ''}
      <div class="brand">${esc(settings.business_name)}</div>
    </div>
    <div class="meta">
      <strong>${esc(offer.offer_number)}</strong><br/>
      Datum: ${esc(new Date(offer.issue_date).toLocaleDateString('de-CH'))}<br/>
      Gültig bis: ${esc(new Date(offer.valid_until).toLocaleDateString('de-CH'))}<br/>
      Status: ${esc(offer.status)}
    </div>
  </div>

  <h1>Offerte</h1>
  <div class="subtitle">${esc(offer.title)}${project?.title ? ` · ${esc(project.title)}` : ''}</div>

  <section class="addresses">
    <div><h3>Von</h3><p><strong>${esc(issuerName)}</strong><br/>${issuerAddress.map(esc).join('<br/>')}<br/>${esc(settings.email)}</p></div>
    <div><h3>An</h3><p><strong>${esc(customerName)}</strong><br/>${customerAddress.map(esc).join('<br/>')}<br/>${esc(customer.email || '')}</p></div>
  </section>

  <table>
    <thead><tr><th>Leistung</th><th class="num">Menge</th><th class="num">Einzelpreis</th><th class="num">Betrag</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <section class="totals">
    <div><span>Zwischensumme</span><strong>${esc(money(offer.subtotal_rappen,currency))}</strong></div>
    ${Number(offer.tax_rappen) ? `<div><span>Steuern (${esc(taxRate)}%)</span><strong>${esc(money(offer.tax_rappen,currency))}</strong></div>` : ''}
    <div class="grand"><span>Total</span><span>${esc(money(offer.total_rappen,currency))}</span></div>
  </section>

  <section class="notes">
    ${offer.notes ? `<div><h3>Notiz</h3><p>${esc(offer.notes)}</p></div>` : ''}
    <div><h3>Bedingungen</h3><p>${esc(offer.terms)}</p></div>
  </section>

  <footer class="footer">
    <span>${esc(settings.business_name)} · ${esc(settings.email)}${settings.phone ? ` · ${esc(settings.phone)}` : ''}</span>
    <span>${settings.vat_enabled && settings.vat_number ? esc(settings.vat_number) : esc(settings.uid_number || '')}</span>
  </footer>
</main>
<div class="actions"><button onclick="window.print()">Drucken / Als PDF sichern</button></div>
</body>
</html>`;

    return new Response(html,{
      status:200,
      headers:{
        'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'private, no-store',
        'Content-Security-Policy':"default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
        'X-Content-Type-Options':'nosniff',
      },
    });
  }catch(error){
    return jsonError(error);
  }
}

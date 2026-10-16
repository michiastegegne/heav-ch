import type { CSSProperties } from 'react';
import { ArrowDownLeft, ArrowUpRight, ArrowRight, BriefcaseBusiness, Check, Clock3, FileText, Users, Wallet } from 'lucide-react';

type Invoice = { id:string; invoice_number:string; status:string; due_date:string; total_rappen:number; currency:string; customers?:{company?:string|null;contact_name?:string|null}|null };
type Project = { id:string;title:string;status:string;due_date:string|null;customers?:{company?:string|null;contact_name?:string|null}|null };
type Activity = { id:string;summary:string;createdAt:string;source:string };
type Props = {
 invoices:Invoice[]; projects:Project[]; customerCount:number; offerCount:number;
 activity:Activity[]; canViewFinance:boolean;
 onNavigate:(tab:'invoices'|'projects'|'customers'|'offers'|'activity')=>void;
 onProject:(id:string)=>void; onCreateProject:()=>void;
};
const money=(value:number)=>new Intl.NumberFormat('de-CH',{style:'currency',currency:'CHF',maximumFractionDigits:2}).format(value/100);
const name=(item:{customers?:{company?:string|null;contact_name?:string|null}|null})=>item.customers?.company||item.customers?.contact_name||'Kunde';
const date=(value:string)=>new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'short'}).format(new Date(value+'T12:00:00'));
const statusText:Record<string,string>={planning:'Geplant',active:'In Arbeit',on_hold:'Pausiert',completed:'Abgeschlossen',overdue:'Überfällig',sent:'Offen',draft:'Entwurf',paid:'Bezahlt',cancelled:'Storniert'};
function MoneyMetric({value}:{value:number}) {
 const parts=new Intl.NumberFormat('de-CH',{style:'currency',currency:'CHF'}).formatToParts(value/100);
 return <strong className="hive-kpi-money"><span className="hive-kpi-currency">CHF</span>{' '}<span className="hive-kpi-value">{parts.filter(part=>part.type!=='currency'&&part.type!=='literal').map(part=>part.value).join('')}</span></strong>;
}
export default function WorkspaceOverview({invoices,projects,customerCount,offerCount,activity,canViewFinance,onNavigate,onProject,onCreateProject}:Props){
 const open=invoices.filter(invoice=>invoice.status==='sent'||invoice.status==='overdue');
 const outstanding=open.reduce((sum,invoice)=>sum+Number(invoice.total_rappen),0);
 const overdue=open.filter(invoice=>invoice.status==='overdue');
 const active=projects.filter(project=>project.status==='active'||project.status==='planning');
 const paid=invoices.filter(invoice=>invoice.status==='paid').reduce((sum,invoice)=>sum+Number(invoice.total_rappen),0);
 const paidCount=invoices.filter(invoice=>invoice.status==='paid').length;
 const paidShare=paid+outstanding>0?Math.round(paid/(paid+outstanding)*100):0;
 const nextProjects=[...active].sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999')).slice(0,4);
 const nextInvoices=[...open].sort((a,b)=>a.due_date.localeCompare(b.due_date)).slice(0,4);
 return <div className="hive-overview">
  <section className="hive-kpis" aria-label="Business-Kennzahlen">
   {canViewFinance ? <>
    <button className="hive-metric-hero" onClick={()=>onNavigate('invoices')}>
     <span className="hive-metric-label"><Wallet size={17}/> Offene Forderungen <ArrowUpRight size={18}/></span>
     <div className="hive-metric-hero-body">
      <MoneyMetric value={outstanding}/>
      <div className="hive-finance-orbit" aria-hidden="true" style={{'--paid-share':`${paidShare}%`} as CSSProperties}><div><span>{paidShare}%</span><small>bezahlt</small></div></div>
     </div>
     <small className="hive-metric-foot"><span className="hive-metric-dot"/>{overdue.length?`${overdue.length} davon überfällig`:'Keine überfälligen Rechnungen'}<ArrowRight size={16}/></small>
    </button>
    <button className="hive-metric-paid" onClick={()=>onNavigate('invoices')}>
     <span className="hive-metric-label"><span className="hive-metric-icon"><ArrowDownLeft size={20}/></span> Zahlungseingänge <ArrowUpRight size={16}/></span>
     <MoneyMetric value={paid}/><small>{paidCount} bezahlt · gesamt</small>
    </button>
   </> : <>
    <div className="hive-kpi-locked"><span>Finanzen</span><strong>—</strong><small>Für deine Rolle eingeschränkt</small></div>
    <div className="hive-kpi-locked"><span>Pipeline</span><strong>—</strong><small>Für deine Rolle eingeschränkt</small></div>
   </>}
   <button className="hive-metric-projects" onClick={()=>onNavigate('projects')}><span className="hive-metric-label"><span className="hive-metric-icon"><BriefcaseBusiness size={19}/></span>Laufende Projekte<ArrowUpRight size={15}/></span><strong>{active.length.toString().padStart(2,'0')}</strong><small>{projects.length} Projekte im Workspace</small></button>
   <button className="hive-metric-customers" onClick={()=>onNavigate('customers')}><span className="hive-metric-label"><span className="hive-metric-icon"><Users size={19}/></span>Kundenstamm<ArrowUpRight size={15}/></span><strong>{customerCount.toString().padStart(2,'0')}</strong><small>{canViewFinance?`${offerCount} offene Offerten`:'Kontakte im Workspace'}</small></button>
  </section>
  <div className="hive-overview-grid">
   <div className="hive-overview-primary">
    <section className="hive-panel hive-project-panel">
     <header className="hive-panel-heading"><div><span className="hive-eyebrow">DEINE ARBEIT</span><h2>Projekte im Fokus <span>{active.length}</span></h2></div><button onClick={()=>onNavigate('projects')}>Alle Projekte <ArrowRight size={16}/></button></header>
     {nextProjects.length?<div className="hive-project-focus">{nextProjects.map((project,index)=><button key={project.id} onClick={()=>onProject(project.id)}><span className={`hive-project-index hive-project-tone-${index}`}><BriefcaseBusiness size={19}/></span><span className="hive-record"><strong>{project.title}</strong><small>{name(project)}</small></span><span className="hive-status" data-state={project.status}>{statusText[project.status]||project.status}</span><span className="hive-project-due">{project.due_date?date(project.due_date):'Ohne Termin'}</span><ArrowUpRight size={16}/></button>)}</div>:<div className="hive-quiet-empty"><BriefcaseBusiness size={24}/><div><strong>Platz für deine nächste Idee.</strong><p>{projects.length?`${projects.length} Projekte sind abgeschlossen oder pausiert.`:'Starte dein erstes Kundenprojekt.'}</p><button onClick={onCreateProject} disabled={!customerCount}>Projekt anlegen <ArrowRight size={14}/></button></div></div>}
    </section>
    {canViewFinance?<section className="hive-panel hive-finance-panel">
     <header className="hive-panel-heading"><div><span className="hive-eyebrow">DEINE FINANZEN</span><h2>Offene Rechnungen <span>{open.length}</span></h2></div><button onClick={()=>onNavigate('invoices')}>Alle Rechnungen <ArrowRight size={16}/></button></header>
     {nextInvoices.length?<div className="hive-finance-list"><div className="hive-finance-labels"><span>Rechnung / Kunde</span><span>Fälligkeit</span><span>Betrag</span></div>{nextInvoices.map(invoice=><button className="hive-finance-row" key={invoice.id} onClick={()=>onNavigate('invoices')}><span className="hive-record"><strong>{name(invoice)}</strong><small>{invoice.invoice_number}</small></span><span className={`hive-due ${invoice.status==='overdue'?'is-overdue':''}`}>{date(invoice.due_date)}<small>{statusText[invoice.status]||invoice.status}</small></span><strong className="hive-amount">{money(invoice.total_rappen)}</strong></button>)}</div>:<div className="hive-quiet-empty"><Check size={22}/><div><strong>Alles ausgeglichen.</strong><p>Offene Zahlungen erscheinen hier.</p></div></div>}
     <footer className="hive-panel-foot"><span>Offener Rechnungswert</span><strong>{money(outstanding)}</strong></footer>
    </section>:<section className="hive-panel hive-finance-locked-panel"><div><span className="hive-eyebrow">FINANZEN</span><h2>Finanzbereich eingeschränkt</h2><p>Deine Rolle kann Kunden und Projekte bearbeiten, aber keine Finanzkennzahlen sehen.</p></div></section>}
   </div>
   <aside className="hive-overview-aside">
    <section className="hive-attention"><span className="hive-eyebrow">DEIN NÄCHSTER SCHRITT</span><div className="hive-attention-title"><span className="hive-attention-icon"><Clock3 size={23}/></span><h2>{canViewFinance&&overdue.length?'Zahlung im Blick behalten.':'Weiter an deiner nächsten Idee.'}</h2></div><p>{canViewFinance&&overdue.length?`${overdue.length} ${overdue.length===1?'Rechnung ist':'Rechnungen sind'} überfällig. Prüfe die Zahlungseingänge, bevor du nachfasst.`:active.length?'Die nächsten Projekte warten auf dich. Aufgaben, Dateien und Termine sind an einem Ort.':'Lege ein Projekt an und bring deine Arbeit ins Rollen.'}</p><button onClick={()=>onNavigate(canViewFinance&&overdue.length?'invoices':'projects')}>{canViewFinance&&overdue.length?'Rechnungen ansehen':'Projekte öffnen'}<ArrowRight size={16}/></button></section>
    <section className="hive-panel hive-activity-panel"><header className="hive-panel-heading"><div><span className="hive-eyebrow">DEIN WORKSPACE</span><h2>Zuletzt passiert</h2></div><span className="hive-activity-pulse" aria-hidden="true"/></header>{activity.length?<ol>{activity.slice(0,4).map(item=><li key={item.id}><span className="hive-timeline-mark"><FileText size={15}/></span><div><p>{item.summary}</p><time dateTime={item.createdAt}>{new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(item.createdAt))}</time></div></li>)}</ol>:<p className="hive-activity-empty">Hier erscheinen neue Änderungen.</p>}<button className="hive-text-link" onClick={()=>onNavigate('activity')}>Gesamter Verlauf<ArrowRight size={15}/></button></section>
   </aside>
  </div>
 </div>;
}

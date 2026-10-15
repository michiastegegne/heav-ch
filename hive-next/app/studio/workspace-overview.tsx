import { ArrowDownLeft, ArrowUpRight, ArrowRight, BriefcaseBusiness, Check, Clock3, FileText } from 'lucide-react';

type Invoice = { id:string; invoice_number:string; status:string; due_date:string; total_rappen:number; currency:string; customers?:{company?:string|null;contact_name?:string|null}|null };
type Project = { id:string;title:string;status:string;due_date:string|null;customers?:{company?:string|null;contact_name?:string|null}|null };
type Activity = { id:string;summary:string;createdAt:string;source:string };
type Props = {
 invoices:Invoice[]; projects:Project[]; customerCount:number; offerCount:number;
 activity:Activity[]; onNavigate:(tab:'invoices'|'projects'|'customers'|'offers'|'activity')=>void;
 onProject:(id:string)=>void; onCreateProject:()=>void;
};
const money=(value:number)=>new Intl.NumberFormat('de-CH',{style:'currency',currency:'CHF',maximumFractionDigits:2}).format(value/100);
const name=(item:{customers?:{company?:string|null;contact_name?:string|null}|null})=>item.customers?.company||item.customers?.contact_name||'Kunde';
const date=(value:string)=>new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'short'}).format(new Date(value+'T12:00:00'));
const statusText:Record<string,string>={planning:'Geplant',active:'In Arbeit',on_hold:'Pausiert',completed:'Abgeschlossen',overdue:'Überfällig',sent:'Offen',draft:'Entwurf',paid:'Bezahlt',cancelled:'Storniert'};

export default function WorkspaceOverview({invoices,projects,customerCount,offerCount,activity,onNavigate,onProject,onCreateProject}:Props){
 const open=invoices.filter(i=>i.status==='sent'||i.status==='overdue');
 const outstanding=open.reduce((sum,i)=>sum+Number(i.total_rappen),0);
 const overdue=open.filter(i=>i.status==='overdue');
 const active=projects.filter(p=>p.status==='active'||p.status==='planning');
 const paid=invoices.filter(i=>i.status==='paid').reduce((sum,i)=>sum+Number(i.total_rappen),0);
 const nextProjects=[...active].sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999')).slice(0,5);
 const nextInvoices=[...open].sort((a,b)=>a.due_date.localeCompare(b.due_date)).slice(0,5);
 return <div className="hive-overview">
  <section className="hive-kpis" aria-label="Business-Kennzahlen">
   <button onClick={()=>onNavigate('invoices')}><span>Offene Forderungen <ArrowUpRight size={15}/></span><strong>{money(outstanding)}</strong><small>{overdue.length?`${overdue.length} davon überfällig`:'Keine überfälligen Rechnungen'}</small></button>
   <button onClick={()=>onNavigate('invoices')}><span>Zahlungseingänge <ArrowDownLeft size={15}/></span><strong>{money(paid)}</strong><small>Bezahlte Rechnungen · gesamt</small></button>
   <button onClick={()=>onNavigate('projects')}><span>Laufende Projekte <BriefcaseBusiness size={15}/></span><strong>{active.length.toString().padStart(2,'0')}</strong><small>{projects.length} Projekte im Workspace</small></button>
   <button onClick={()=>onNavigate('customers')}><span>Kundenstamm <ArrowUpRight size={15}/></span><strong>{customerCount.toString().padStart(2,'0')}</strong><small>{offerCount} offene Offerten</small></button>
  </section>

  <div className="hive-overview-grid">
   <div className="hive-overview-primary">
    <section className="hive-panel">
     <header className="hive-panel-heading"><div><span className="hive-eyebrow">FINANZEN</span><h2>Offene Rechnungen <span>{open.length}</span></h2></div><button onClick={()=>onNavigate('invoices')}>Alle Rechnungen <ArrowRight size={14}/></button></header>
     {nextInvoices.length?<div className="hive-finance-list"><div className="hive-finance-labels"><span>Rechnung / Kunde</span><span>Fällig am</span><span>Betrag</span></div>{nextInvoices.map(i=><button className="hive-finance-row" key={i.id} onClick={()=>onNavigate('invoices')}><span className="hive-record"><strong>{name(i)}</strong><small>{i.invoice_number}</small></span><span className={`hive-due ${i.status==='overdue'?'is-overdue':''}`}>{i.status==='overdue'&&<span className="hive-status-dot"/>}{date(i.due_date)}<small>{statusText[i.status]||i.status}</small></span><strong className="hive-amount">{money(i.total_rappen)}</strong></button>)}</div>:<div className="hive-quiet-empty"><Check size={20}/><div><strong>Alles ausgeglichen.</strong><p>Hier erscheinen ausstehende Zahlungen, sobald du Rechnungen ausstellst.</p></div></div>}
     <footer className="hive-panel-foot"><span>Offener Rechnungswert</span><strong>{money(outstanding)}</strong></footer>
    </section>

    <section className="hive-panel">
     <header className="hive-panel-heading"><div><span className="hive-eyebrow">PRODUKTION</span><h2>Projekte im Fokus <span>{active.length}</span></h2></div><button onClick={()=>onNavigate('projects')}>Alle Projekte <ArrowRight size={14}/></button></header>
     {nextProjects.length?<div className="hive-project-focus">{nextProjects.map((p,index)=><button key={p.id} onClick={()=>onProject(p.id)}><span className="hive-project-index">{String(index+1).padStart(2,'0')}</span><span className="hive-record"><strong>{p.title}</strong><small>{name(p)}</small></span><span className="hive-status">{statusText[p.status]||p.status}</span><span className="hive-project-due">{p.due_date?date(p.due_date):'Ohne Termin'}</span><ArrowUpRight size={15}/></button>)}</div>:<div className="hive-quiet-empty"><BriefcaseBusiness size={20}/><div><strong>Raum für das nächste Projekt.</strong><p>{projects.length?`${projects.length} Projekte sind abgeschlossen oder pausiert.`:'Lege dein erstes Projekt an und halte Aufgaben und Termine zusammen.'}</p><button onClick={onCreateProject} disabled={!customerCount}>Projekt anlegen <ArrowRight size={14}/></button></div></div>}
    </section>
   </div>

   <aside className="hive-overview-aside">
    <section className="hive-attention"><span className="hive-eyebrow">IM BLICK BEHALTEN</span><div className="hive-attention-title"><Clock3 size={17}/><h2>{overdue.length?'Zahlung ausstehend':'Dein nächster Schritt'}</h2></div><p>{overdue.length?`${overdue.length} ${overdue.length===1?'Rechnung ist':'Rechnungen sind'} überfällig. Prüfe die Zahlungseingänge, bevor du nachfasst.`:active.length?'Prüfe die nächsten Abgaben und halte deine Projekte auf Kurs.':'Starte ein Projekt oder bereite die nächste Offerte vor.'}</p><button onClick={()=>onNavigate(overdue.length?'invoices':'projects')}>{overdue.length?'Rechnungen ansehen':'Projekte öffnen'} <ArrowRight size={14}/></button></section>
    <section className="hive-activity-panel"><header className="hive-panel-heading"><div><span className="hive-eyebrow">VERLAUF</span><h2>Zuletzt passiert</h2></div></header>{activity.length?<ol>{activity.slice(0,5).map(item=><li key={item.id}><span className="hive-timeline-mark"><FileText size={13}/></span><div><p>{item.summary}</p><time dateTime={item.createdAt}>{new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(item.createdAt))}</time></div></li>)}</ol>:<p className="hive-activity-empty">Neue Änderungen an Kunden, Projekten und Dokumenten erscheinen hier.</p>}<button className="hive-text-link" onClick={()=>onNavigate('activity')}>Gesamter Verlauf <ArrowRight size={14}/></button></section>
   </aside>
  </div>
 </div>;
}

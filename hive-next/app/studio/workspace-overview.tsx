"use client";

import { useState, type FormEvent } from "react";
import { ArrowUp, ArrowUpRight, BriefcaseBusiness, CircleCheck, ChevronRight, Database, CreditCard, FileText, Plus, Search, Users } from "lucide-react";
import { stateLabel } from "./status-labels";

type Related = { customers?: { company?:string|null; contact_name?:string|null }|null };
type Invoice = Related & {id:string;invoice_number:string;status:string;due_date:string;total_rappen:number;currency:string};
type Project = Related & {id:string;title:string;status:string;due_date:string|null};
type Activity = {id:string;summary:string;createdAt:string;source:string};
type Tab = "invoices"|"projects"|"customers"|"offers"|"activity";
type Props = {
 invoices:Invoice[]; projects:Project[]; customerCount:number; offerCount:number; activity:Activity[]; canViewFinance:boolean;
 onNavigate:(tab:Tab)=>void; onProject:(id:string)=>void; onCreateProject:()=>void;
 onSearch:(query:string)=>void; onCreate:()=>void;
};
const money=(value:number,currency="CHF")=>new Intl.NumberFormat("de-CH",{style:"currency",currency}).format(value/100);
const name=(item:Related)=>item.customers?.company||item.customers?.contact_name||"Kunde";
const date=(value:string)=>new Intl.DateTimeFormat("de-CH",{day:"2-digit",month:"short"}).format(new Date(value+"T12:00:00"));

export default function WorkspaceOverview({invoices,projects,customerCount,offerCount,activity,canViewFinance,onNavigate,onProject,onCreateProject,onSearch,onCreate}:Props) {
 const [query,setQuery]=useState("");
 const active=projects.filter(p=>p.status==='active'||p.status==='planning');
 const open=invoices.filter(i=>i.status==='sent'||i.status==='overdue');
 const outstanding=open.reduce((sum,i)=>sum+Number(i.total_rappen),0);
 const paid=invoices.filter(i=>i.status==='paid').reduce((sum,i)=>sum+Number(i.total_rappen),0);
 const focus=[...active].sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999')).slice(0,3);
 const metrics=[
  {label:'Kunden',value:String(customerCount),note:'Kontakte im Workspace',tab:'customers' as const},
  {label:'Laufende Projekte',value:String(active.length),note:`${projects.length} Projekte insgesamt`,tab:'projects' as const},
  ...(canViewFinance?[{label:'Offene Forderungen',value:money(outstanding),note:`${open.length} offene Rechnungen`,tab:'invoices' as const},{label:'Zahlungseingänge',value:money(paid),note:'Bezahlte Rechnungen · gesamt',tab:'invoices' as const}]:[]),
 ];
 const shortcuts=[{label:'Kunden ansehen',icon:Users,tab:'customers' as const},{label:'Projekte öffnen',icon:BriefcaseBusiness,tab:'projects' as const},...(canViewFinance?[{label:'Rechnungen',icon:CreditCard,tab:'invoices' as const},{label:'Offerten',icon:FileText,tab:'offers' as const}]:[])];
 function submit(event:FormEvent){event.preventDefault();onSearch(query.trim());}
 return <div className="hive-start-screen">
  <section className="hive-start-intro" aria-label="Dein Workspace">
   <h1>Was steht heute an?</h1>
   <form className="hive-composer" onSubmit={submit} role="search" aria-label="Workspace-Suche">
    <div className="hive-composer-field"><Search size={16} aria-hidden="true"/><input aria-label="Im Workspace suchen" placeholder="Im Workspace suchen …" value={query} onChange={event=>setQuery(event.target.value)} autoComplete="off"/></div>
    <div className="hive-composer-controls">
     <button type="button" aria-label="Schnell erstellen" onClick={onCreate} className="hive-composer-plus"><Plus size={22}/></button>
     <span>Dein Workspace</span>
     <button type="submit" aria-label="Suche öffnen" className="hive-composer-submit"><ArrowUp size={20}/></button>
    </div>
   </form>
   <div className="hive-start-shortcuts">{shortcuts.map(({label,icon:Icon,tab})=><button key={tab} onClick={()=>onNavigate(tab)}><Icon size={16}/>{label}</button>)}</div>
  </section>
  <section className="hive-start-content" aria-label="Workspace im Überblick">
   <div className="hive-start-section-label"><h2><Database size={15} aria-hidden="true"/> Workspace im Überblick</h2><span>{offerCount ? `${offerCount} offene ${offerCount===1?'Offerte':'Offerten'}`:'Alles an einem Ort'}</span></div>
   <div className="crm-metrics" role="group" aria-label="Business-Kennzahlen">{metrics.map(metric=><button key={metric.label} onClick={()=>onNavigate(metric.tab)}><span>{metric.label}</span><strong className="hive-kpi-value">{metric.value}</strong><small>{metric.note}</small></button>)}</div>
   <div className="hive-start-sections">
    <section className="hive-start-section" aria-label="Projekte im Fokus">
     <header><h3><BriefcaseBusiness size={15} aria-hidden="true"/> Projekte im Fokus</h3><button onClick={()=>onNavigate('projects')} aria-label="Alle Projekte"><ArrowUpRight size={17}/></button></header>
     {focus.length?focus.map(p=><button className="hive-start-record" onClick={()=>onProject(p.id)} key={p.id}><span className="hive-start-record-icon"><BriefcaseBusiness size={18}/></span><span><strong>{p.title}</strong><small>{name(p)}{p.due_date?` · ${date(p.due_date)}`:''}</small></span><span className="hive-status" data-state={p.status}>{stateLabel[p.status] || p.status}</span></button>):<div className="hive-start-empty"><p>Dein nächstes Projekt beginnt hier.</p><button onClick={customerCount?onCreateProject:()=>onNavigate('customers')}><Plus size={16}/>{customerCount?'Projekt anlegen':'Ersten Kunden anlegen'}</button></div>}
    </section>
    {canViewFinance&&<section className="hive-start-section" aria-label="Offene Rechnungen"><header><h3><FileText size={15} aria-hidden="true"/> Offene Rechnungen</h3><button onClick={()=>onNavigate('invoices')} aria-label="Alle Rechnungen"><ArrowUpRight size={17}/></button></header>{open.length?[...open].sort((a,b)=>a.due_date.localeCompare(b.due_date)).slice(0,3).map(i=><button className="hive-start-record" onClick={()=>onNavigate('invoices')} key={i.id}><span className="hive-start-record-icon"><FileText size={18}/></span><span><strong>{name(i)}</strong><small>{i.invoice_number} · {date(i.due_date)}</small></span><span className="hive-start-amount">{money(i.total_rappen,i.currency)}<small className="hive-status" data-state={i.status}>{stateLabel[i.status] || i.status}</small></span></button>):<p className="hive-start-settled"><CircleCheck size={15} aria-hidden="true"/> Alles ausgeglichen.</p>}</section>}
   </div>
   {activity.length>0&&<button className="hive-start-latest" onClick={()=>onNavigate('activity')}><span><span className="hive-activity-dot"/>{activity[0].summary}</span><span>Verlauf <ChevronRight size={14}/></span></button>}
  </section>
 </div>;
}

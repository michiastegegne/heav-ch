'use client';

import { ArrowRight, BriefcaseBusiness, CreditCard, RefreshCw, ShieldCheck, Users } from 'lucide-react';

export type BusinessOverviewItem = {
  id:string;
  name:string;
  slug:string;
  role:string;
  logoUrl:string;
  accentColor:string;
  currency:string;
  customerCount:number;
  projectCount:number;
  activeProjectCount:number;
  canViewFinance:boolean;
  openRappen:number|null;
  paidRappen:number|null;
  overdueCount:number|null;
  pipelineRappen:number|null;
};

const money=(rappen:number|null,currency:string) =>
  rappen === null
    ? '—'
    : new Intl.NumberFormat('de-CH',{style:'currency',currency}).format(rappen/100);

const roleLabel:Record<string,string>={
  owner:'Owner',
  admin:'Admin',
  accountant:'Finanzen',
  member:'Member',
};

export default function BusinessesOverview({
  items,
  busy,
  error,
  onOpen,
  onRefresh,
}:{
  items:BusinessOverviewItem[];
  busy:boolean;
  error:string;
  onOpen:(workspaceId:string)=>void;
  onRefresh:()=>void;
}) {
  const totalCustomers=items.reduce((sum,item)=>sum+item.customerCount,0);
  const totalProjects=items.reduce((sum,item)=>sum+item.projectCount,0);
  const activeProjects=items.reduce((sum,item)=>sum+item.activeProjectCount,0);

  if (error) {
    return <div className="hsv-empty hive-businesses-error">
      <strong>Businesses konnten nicht geladen werden.</strong>
      <p>{error}</p>
      <button className="hsv-outline" onClick={onRefresh}><RefreshCw size={14}/> Erneut laden</button>
    </div>;
  }

  return <section className="hive-businesses">
    <div className="hive-businesses-summary">
      <div><span>BUSINESSES</span><strong>{busy ? '—' : items.length.toString().padStart(2,'0')}</strong><small>aktive Workspaces</small></div>
      <div><span>KUNDEN</span><strong>{busy ? '—' : totalCustomers.toString().padStart(2,'0')}</strong><small>über alle Businesses</small></div>
      <div><span>PROJEKTE</span><strong>{busy ? '—' : totalProjects.toString().padStart(2,'0')}</strong><small>{activeProjects} aktuell aktiv</small></div>
    </div>

    {busy ? <div className="hive-businesses-grid" aria-label="Businesses werden geladen">
      {[0,1].map((item)=><div className="hive-business-card hive-business-card-loading" key={item}><span/><span/><span/><span/></div>)}
    </div> : <div className="hive-businesses-grid">
      {items.map((item)=><article className="hive-business-card" key={item.id}>
        <header>
          <span className="hive-business-avatar" style={{background:item.accentColor}}>
            {item.logoUrl ? <img src={item.logoUrl} alt=""/> : item.name.charAt(0).toUpperCase()}
          </span>
          <div><strong>{item.name}</strong><small>{roleLabel[item.role] || item.role}</small></div>
          <span className="hive-business-state"><ShieldCheck size={13}/> Aktiv</span>
        </header>

        <div className="hive-business-operational">
          <div><Users size={15}/><span>Kunden</span><strong>{item.customerCount}</strong></div>
          <div><BriefcaseBusiness size={15}/><span>Projekte</span><strong>{item.projectCount}</strong></div>
          <div><BriefcaseBusiness size={15}/><span>Aktiv</span><strong>{item.activeProjectCount}</strong></div>
        </div>

        {item.canViewFinance ? <div className="hive-business-finance">
          <div><span>Offen</span><strong>{money(item.openRappen,item.currency)}</strong></div>
          <div><span>Bezahlt</span><strong>{money(item.paidRappen,item.currency)}</strong></div>
          <div><span>Pipeline</span><strong>{money(item.pipelineRappen,item.currency)}</strong></div>
          <small><CreditCard size={13}/>{item.overdueCount || 0} überfällige Rechnung{item.overdueCount===1?'':'en'}</small>
        </div> : <div className="hive-business-finance-locked">
          <ShieldCheck size={15}/><span>Finanzkennzahlen sind für deine Rolle eingeschränkt.</span>
        </div>}

        <button className="hive-business-open" onClick={()=>onOpen(item.id)}>
          Business öffnen <ArrowRight size={15}/>
        </button>
      </article>)}
    </div>}
  </section>;
}

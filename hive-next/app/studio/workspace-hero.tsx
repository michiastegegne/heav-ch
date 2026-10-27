import { ArrowUpRight, Plus } from 'lucide-react';

type Project = { id:string; title:string; status:string; due_date:string|null; customers?:{company?:string|null;contact_name?:string|null}|null };
type Props = { projects:Project[]; customerCount:number; onProject:(id:string)=>void; onCreate:()=>void; onCustomers:()=>void; onProjects:()=>void };
export default function WorkspaceHero({projects,customerCount,onProject,onCreate,onCustomers,onProjects}:Props) {
  const active=projects.filter(p=>p.status==='active'||p.status==='planning');
  const focus=[...active].sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999'))[0];
  const stages=[['planning','Geplant'],['active','In Arbeit'],['completed','Abgeschlossen']] as const;
  return <section className="hive-workspace-hero" aria-label="Dein Arbeitsbereich">
    <div className="hive-hero-copy">
      <span className="hive-eyebrow">DEIN WORKSPACE, DEIN FLOW</span>
      <h2>Gute Ideen.<br/><span>Klare nächste Schritte.</span></h2>
      <p>{active.length ? `${active.length} ${active.length===1?'Projekt wartet':'Projekte warten'} auf deinen nächsten Schritt. Alles Wichtige liegt bereit.` : 'Platz für dein nächstes Projekt. Bring Kunden, Ideen und Aufgaben zusammen.'}</p>
      <button type="button" className="hive-hero-create" onClick={customerCount?onCreate:onCustomers}><Plus size={17}/>{customerCount?'Neues Projekt':'Ersten Kunden anlegen'}</button>
    </div>
    <div className="hive-hero-focus">
      <span className="hive-eyebrow">IM FOKUS</span>
      {focus ? <button type="button" className="hive-hero-project" onClick={()=>onProject(focus.id)} aria-label={`Projekt im Fokus: ${focus.title}`}>
        <span className="hive-hero-project-top"><span>{focus.customers?.company||focus.customers?.contact_name||'Dein Projekt'}</span><ArrowUpRight size={20}/></span>
        <strong>{focus.title}</strong>
        <span className="hive-hero-date">{focus.due_date ? `Abgabe · ${new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'long'}).format(new Date(focus.due_date+'T12:00:00'))}` : 'Abgabe noch offen'}</span>
      </button> : <div className="hive-hero-project hive-hero-empty"><strong>Dein nächster Meilenstein beginnt hier.</strong><span>Erstelle ein Projekt und halte die nächsten Schritte fest.</span></div>}
      <button type="button" className="hive-hero-stages" onClick={onProjects} aria-label="Projektstatus im Überblick">
        {stages.map(([status,label])=><span key={status} data-stage={status}><strong>{projects.filter(p=>p.status===status).length}</strong><small>{label}</small></span>)}
      </button>
    </div>
  </section>;
}

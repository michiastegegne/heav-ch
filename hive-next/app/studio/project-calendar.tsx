'use client';

import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

type CalendarProject = {
  id:string;
  title:string;
  status:'planning'|'active'|'completed'|'on_hold';
  due_date:string|null;
  start_date:string|null;
  customers?:{ company?:string|null; contact_name?:string|null }|null;
};

const statusLabel:Record<CalendarProject['status'],string>={
  planning:'Geplant',
  active:'In Arbeit',
  on_hold:'Pausiert',
  completed:'Fertig',
};

const customer=(project:CalendarProject) =>
  project.customers?.company?.trim() || project.customers?.contact_name?.trim() || 'Kunde';

const isoDate=(year:number,month:number,day:number) =>
  `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

export default function ProjectCalendar({
  projects,
  onOpen,
}:{
  projects:CalendarProject[];
  onOpen:(projectId:string)=>void;
}) {
  const today=new Date();
  const [cursor,setCursor]=useState(()=>new Date(today.getFullYear(),today.getMonth(),1));
  const year=cursor.getFullYear();
  const month=cursor.getMonth();
  const formatter=new Intl.DateTimeFormat('de-CH',{month:'long',year:'numeric'});
  const weekday=['Mo','Di','Mi','Do','Fr','Sa','So'];

  const cells=useMemo(()=>{
    const first=new Date(year,month,1);
    const offset=(first.getDay()+6)%7;
    const days=new Date(year,month+1,0).getDate();
    const total=Math.ceil((offset+days)/7)*7;
    return Array.from({length:total},(_,index)=>{
      const day=index-offset+1;
      if(day<1||day>days)return null;
      const key=isoDate(year,month,day);
      return {
        day,
        key,
        projects:projects.filter((project)=>project.due_date===key),
      };
    });
  },[projects,year,month]);

  const agenda=useMemo(()=>projects
    .filter((project)=>project.due_date?.startsWith(`${year}-${String(month+1).padStart(2,'0')}-`))
    .sort((left,right)=>(left.due_date||'').localeCompare(right.due_date||'')),[projects,year,month]);

  const undated=projects.filter((project)=>!project.due_date);

  function changeMonth(delta:number){
    setCursor((current)=>new Date(current.getFullYear(),current.getMonth()+delta,1));
  }

  return <section className="hive-project-calendar">
    <header className="hive-calendar-toolbar">
      <div><CalendarDays size={16}/><strong>{formatter.format(cursor)}</strong></div>
      <div>
        <button type="button" aria-label="Vorheriger Monat" onClick={()=>changeMonth(-1)}><ChevronLeft size={16}/></button>
        <button type="button" onClick={()=>setCursor(new Date(today.getFullYear(),today.getMonth(),1))}>Heute</button>
        <button type="button" aria-label="Nächster Monat" onClick={()=>changeMonth(1)}><ChevronRight size={16}/></button>
      </div>
    </header>

    <div className="hive-project-calendar-grid">
      {weekday.map((day)=><span className="hive-calendar-weekday" key={day}>{day}</span>)}
      {cells.map((cell,index)=>cell
        ? <div className="hive-calendar-day" key={cell.key} data-today={cell.key===isoDate(today.getFullYear(),today.getMonth(),today.getDate())||undefined}>
            <span>{cell.day}</span>
            <div>{cell.projects.map((project)=><button type="button" key={project.id} onClick={()=>onOpen(project.id)}>
              <strong>{project.title}</strong><small>{customer(project)} · {statusLabel[project.status]}</small>
            </button>)}</div>
          </div>
        : <div className="hive-calendar-day hive-calendar-day-empty" key={`empty-${index}`}/>)}
    </div>

    <div className="hive-project-agenda">
      {agenda.length ? agenda.map((project)=><button type="button" key={project.id} onClick={()=>onOpen(project.id)}>
        <time>{new Intl.DateTimeFormat('de-CH',{weekday:'short',day:'2-digit',month:'short'}).format(new Date((project.due_date||'')+'T12:00:00'))}</time>
        <div><strong>{project.title}</strong><small>{customer(project)} · {statusLabel[project.status]}</small></div>
        <span>{statusLabel[project.status]}</span>
      </button>) : <div className="hive-calendar-no-deadlines">Keine Deadlines in diesem Monat.</div>}
      {!!undated.length && <details>
        <summary>{undated.length} Projekt{undated.length===1?'':'e'} ohne Termin</summary>
        {undated.map((project)=><button type="button" key={project.id} onClick={()=>onOpen(project.id)}>
          <div><strong>{project.title}</strong><small>{customer(project)}</small></div>
        </button>)}
      </details>}
    </div>
  </section>;
}

'use client';

import { ArrowUpRight, BriefcaseBusiness, CalendarDays } from 'lucide-react';
import { useState } from 'react';

type ProjectCard = {
  id:string;
  title:string;
  status:'planning'|'active'|'completed'|'on_hold';
  budget_rappen:number;
  due_date:string|null;
  customers?:{ company?:string|null; contact_name?:string|null }|null;
};

const columns:Array<{id:ProjectCard['status'];label:string;hint:string}>=[
  {id:'planning',label:'Geplant',hint:'Noch nicht gestartet'},
  {id:'active',label:'In Arbeit',hint:'Aktuell in Produktion'},
  {id:'on_hold',label:'Pausiert',hint:'Wartet auf Input'},
  {id:'completed',label:'Abgeschlossen',hint:'Fertig geliefert'},
];

const customer=(project:ProjectCard) =>
  project.customers?.company?.trim() || project.customers?.contact_name?.trim() || 'Kunde';

const money=(rappen:number) =>
  new Intl.NumberFormat('de-CH',{style:'currency',currency:'CHF'}).format((Number(rappen)||0)/100);

const date=(value:string|null) =>
  value
    ? new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'2-digit'}).format(new Date(value+'T12:00:00'))
    : 'Kein Termin';

export default function ProjectBoard({
  projects,
  onStatus,
  onOpen,
  onEdit,
}:{
  projects:ProjectCard[];
  onStatus:(project:ProjectCard,status:ProjectCard['status'])=>void;
  onOpen:(projectId:string)=>void;
  onEdit:(project:ProjectCard)=>void;
}) {
  const [dragged,setDragged]=useState('');

  return <div className="hive-project-board">
    {columns.map((column)=>{
      const items=projects.filter((project)=>project.status===column.id);
      return <section
        className="hive-project-column"
        key={column.id}
        data-status={column.id}
        onDragOver={(event)=>event.preventDefault()}
        onDrop={()=>{
          const project=projects.find((item)=>item.id===dragged);
          if (project && project.status!==column.id) onStatus(project,column.id);
          setDragged('');
        }}
      >
        <header>
          <div><strong>{column.label}</strong><small>{column.hint}</small></div>
          <span>{items.length}</span>
        </header>
        <div className="hive-project-column-body">
          {items.map((project)=><article
            className="hive-project-board-card"
            key={project.id}
            draggable
            onDragStart={()=>setDragged(project.id)}
            onDragEnd={()=>setDragged('')}
          >
            <div className="hive-project-board-main">
              <span><BriefcaseBusiness size={14}/></span>
              <div><strong>{project.title}</strong><small>{customer(project)}</small></div>
            </div>
            <div className="hive-project-board-meta">
              <span><CalendarDays size={12}/>{date(project.due_date)}</span>
              <strong>{money(project.budget_rappen)}</strong>
            </div>
            <label>
              <span>Status</span>
              <select
                aria-label={`Status für ${project.title}`}
                value={project.status}
                onChange={(event)=>onStatus(project,event.target.value as ProjectCard['status'])}
              >
                {columns.map((option)=><option value={option.id} key={option.id}>{option.label}</option>)}
              </select>
            </label>
            <div className="hive-project-board-actions">
              <button type="button" onClick={()=>onOpen(project.id)}>Workspace <ArrowUpRight size={13}/></button>
              <button type="button" onClick={()=>onEdit(project)}>Bearbeiten</button>
            </div>
          </article>)}
          {!items.length && <div className="hive-project-column-empty">Keine Projekte</div>}
        </div>
      </section>;
    })}
  </div>;
}

"use client";

import ThemeToggle from "@/app/components/theme-toggle";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, PanelLeft, Plus, Search, Smartphone, SquarePen } from "lucide-react";

type RecentProject={id:string;title:string};
export default function WorkspaceNavigation<T extends string>({items,active,onSelect,customerCount,onCreate,onSearch,onInstall,onNewBusiness,onCollapse,recentProjects,onProject,businessName}:{
 items:readonly (readonly [T,string,LucideIcon])[];active:T;onSelect:(id:T)=>void;customerCount:number;
 onCreate:()=>void;onSearch:()=>void;onInstall:()=>void;onNewBusiness:()=>void;onCollapse?:()=>void;
 recentProjects:RecentProject[];onProject:(id:string)=>void;businessName:string;
}) {
 const groups=[{label:'Workspace',ids:['overview','customers','projects']},{label:'Finanzen',ids:['invoices','offers','catalog']},{label:'Zusammenarbeit',ids:['emails','portal','activity']},{label:'Verwaltung',ids:['businesses','team','branding']}];
 return <nav className="hsv-nav hive-workspace-sidebar crm-ui" aria-label="Business-Module">
  <div className="hive-sidebar-head"><a href="/" aria-label="Hive Startseite"><span className="hive-sidebar-mark">h</span><span>hive</span></a>{onCollapse&&<button type="button" aria-label="Seitenleiste schliessen" onClick={onCollapse}><PanelLeft size={19}/></button>}</div>
  <div className="hive-sidebar-shortcuts"><button type="button" onClick={onCreate}><SquarePen size={19}/><span>Neu erstellen</span></button><button type="button" onClick={onSearch} aria-label="Workspace durchsuchen"><Search size={19}/><span>Workspace durchsuchen</span></button></div>
  <div className="hive-sidebar-scroll">{groups.map(group=>{const links=items.filter(([id])=>group.ids.includes(id));return links.length?<section className="hive-sidebar-group" key={group.label} aria-label={group.label}><h2>{group.label}</h2>{links.map(([id,label,Icon])=><button type="button" key={id} className={active===id?'on':''} aria-current={active===id?'page':undefined} onClick={()=>onSelect(id)}><Icon size={18}/><span>{label}</span>{id==='customers'&&customerCount>0&&<small aria-hidden="true">{customerCount}</small>}</button>)}</section>:null;})}
   {recentProjects.length>0&&<section className="hive-sidebar-group hive-sidebar-recents" aria-label="Letzte Projekte"><h2>Letzte Projekte</h2>{recentProjects.map(project=><button type="button" key={project.id} onClick={()=>onProject(project.id)}><span>{project.title}</span></button>)}</section>}
  </div>
  <div className="hive-sidebar-footer"><div className="hive-sidebar-appearance"><ThemeToggle/><span>Erscheinungsbild</span></div><div className="hive-sidebar-utilities"><button type="button" onClick={onNewBusiness} aria-label="Neues Business erstellen"><Plus size={17}/><span>Business hinzufügen</span></button><button type="button" onClick={onInstall} aria-label="Als App installieren"><Smartphone size={17}/><span>App installieren</span></button></div><a href="/account" className="hive-sidebar-profile"><span className="hive-profile-avatar">{businessName.slice(0,1).toUpperCase()}</span><span><strong>{businessName}</strong><small>Mein Konto</small></span><ArrowUpRight size={15}/></a></div>
 </nav>;
}

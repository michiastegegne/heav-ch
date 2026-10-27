"use client";

import { BriefcaseBusiness, LayoutDashboard, MoreHorizontal, Plus, Users } from "lucide-react";

type MobileTab = "overview" | "customers" | "projects" | "more";
const mobileTabs = [
  { value: "overview" as const, label: "Übersicht", icon: LayoutDashboard },
  { value: "customers" as const, label: "Kunden", icon: Users },
  { value: "projects" as const, label: "Projekte", icon: BriefcaseBusiness },
  { value: "more" as const, label: "Mehr", icon: MoreHorizontal },
];

export function WorkspaceGlassDock({ value, onChange, onCreate }: {
  value: MobileTab;
  onChange: (value: MobileTab) => void;
  onCreate: () => void;
}) {
  return <nav className="hive-app-dock" aria-label="Mobile Navigation">
    <div role="group" aria-label="Mobile Navigation">
      {mobileTabs.map(({value: tab, label, icon: Icon}, index) => <div className="hive-dock-item" key={tab}>
        {index === 2 && <button className="hive-dock-create" type="button" aria-label="Neu erstellen" onClick={onCreate}><span><Plus size={22}/></span><small>Neu</small></button>}
        <button type="button" aria-current={value === tab ? "page" : undefined} onClick={()=>onChange(tab)}><Icon size={21}/><small>{label}</small></button>
      </div>)}
    </div>
  </nav>;
}

type View = "list" | "board" | "calendar";
const views = [{value:"list" as const,label:"Liste"},{value:"board" as const,label:"Board"},{value:"calendar" as const,label:"Kalender"}];
export function WorkspaceViewSwitch({ value, onChange }: { value:View; onChange:(view:View)=>void }) {
  return <div className="hive-library-views hive-view-switch" role="group" aria-label="Projektansicht">
    {views.map(view=><button type="button" key={view.value} aria-pressed={value===view.value} onClick={()=>onChange(view.value)}>{view.label}</button>)}
  </div>;
}

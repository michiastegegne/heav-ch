import { ArrowUpRight, BriefcaseBusiness, CircleHelp, Command, ContactRound, CreditCard, FolderKanban, LayoutDashboard, Plus, Search, Settings2, Sparkles } from 'lucide-react';

const navigation = [
  { label: 'Übersicht', icon: LayoutDashboard, active: true },
  { label: 'Projekte', icon: FolderKanban },
  { label: 'Kunden', icon: ContactRound },
  { label: 'Offerten & Rechnungen', icon: CreditCard },
];
export default function Home() {
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-symbol">H</span><span>hive<span className="brand-dot">.</span></span><span className="brand-caption">STUDIO</span></div>
      <div className="business"><span className="business-avatar">MT</span><span className="business-details"><strong>Michias Tegegne</strong><small>Business Workspace</small></span><span className="business-chevron">⌄</span></div>
      <p className="nav-label">WORKSPACE</p>
      <nav aria-label="Hauptnavigation">{navigation.map(({label, icon:Icon,active}) => <a key={label} className={active ? 'nav-item active' : 'nav-item'} href={active ? '/' : '#modules'}><Icon size={18}/><span>{label}</span>{!active && <span className="soon">Bald</span>}</a>)}</nav>
      <p className="nav-label tools-title">SYSTEM</p>
      <a className="nav-item" href="#modules"><Settings2 size={18}/> Einstellungen <span className="soon">Bald</span></a>
      <div className="sidebar-bottom"><span className="system-dot"/> Entwicklungsansicht <span className="version">v0.1</span></div>
    </aside>
    <section className="main-area">
      <header className="topbar"><div className="crumbs">Workspace <span>/</span> Übersicht</div><div className="top-actions"><span className="shortcut"><Search size={15}/> Suche <kbd>⌘ K</kbd></span><button className="avatar" aria-label="Profil">MT</button></div></header>
      <div className="content">
        <div className="eyebrow"><span className="eyebrow-line"/> DEIN BUSINESS. EIN SYSTEM.</div>
        <div className="heading-row"><div><h1>Good morning<span className="title-period">.</span></h1><p className="intro">Alles, was dein Business bewegt. An einem Ort.</p></div><button className="primary-button" disabled title="Aktivieren wir nach Anbindung der Datenbank"><Plus size={17}/> Neues Projekt</button></div>
        <div className="section-head"><h2>Auf einen Blick</h2><span>Live-Daten werden nach der sicheren Supabase-Anbindung angezeigt</span></div>
        <div className="stats"><div className="stat-card"><div className="stat-top"><span>Aktive Projekte</span><FolderKanban size={17}/></div><strong>—</strong><small>Noch nicht verbunden</small></div><div className="stat-card"><div className="stat-top"><span>Offene Rechnungen</span><CreditCard size={17}/></div><strong>—</strong><small>Noch nicht verbunden</small></div><div className="stat-card"><div className="stat-top"><span>Kunden</span><ContactRound size={17}/></div><strong>—</strong><small>Noch nicht verbunden</small></div></div>
        <div className="split-grid"><section className="panel"><div className="panel-header"><div><h2>Deine Projekte</h2><p>Aktuelle Aufträge und Fortschritt</p></div><ArrowUpRight size={19}/></div><div className="empty-state"><div className="empty-icon"><BriefcaseBusiness size={25}/></div><strong>Hier entsteht dein Workflow.</strong><p>Projektverwaltung wird als erstes echtes Modul mit Datenbankzugriff, Bearbeiten, Archivieren und Löschen entwickelt.</p><span className="small-pill">IN ENTWICKLUNG</span></div></section><section className="panel secondary"><div className="panel-header"><div><h2>Dein Workspace</h2><p>Alles wird modular aufgebaut</p></div><Sparkles size={19}/></div><div className="module-list" id="modules"><div><Command size={19}/><span>Business Switcher</span><small>Geplant</small></div><div><FolderKanban size={19}/><span>Projektmanagement</span><small>Geplant</small></div><div><CreditCard size={19}/><span>Rechnungen & Offerten</span><small>Geplant</small></div><div><CircleHelp size={19}/><span>AI Assistant</span><small>Später</small></div></div></section></div>
        <footer>HIVE <span>CREATIVE BUSINESS OS</span><span>ENTWICKLUNGSVERSION — KEINE LIVE-DATEN</span></footer>
      </div>
    </section>
  </main>;
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, ChevronDown, Circle, Command, FolderOpen, LayoutGrid, List, MoreHorizontal, Plus, Search, Settings2, SlidersHorizontal, Trash2, X } from 'lucide-react';

type Project = { id: string; name: string; client: string; phase: 'Idea' | 'In progress' | 'Done'; createdAt: number };
type View = 'home' | 'projects' | 'activity';
const STORAGE = 'hive-next-local-projects-v2';
const views: { id: View; label: string }[] = [{ id: 'home', label: 'Home' }, { id: 'projects', label: 'Projects' }, { id: 'activity', label: 'Activity' }];

export default function Home() {
  const [view, setView] = useState<View>('home');
  const [projects, setProjects] = useState<Project[]>([]);
  const [ready, setReady] = useState(false);
  const [composer, setComposer] = useState(false);
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [query, setQuery] = useState('');
  const [display, setDisplay] = useState<'list' | 'grid'>('list');
  const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState(false);
  const [accent, setAccent] = useState('black');

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE) || '[]');
      if (Array.isArray(stored)) setProjects(stored.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string' && ['Idea', 'In progress', 'Done'].includes(p.phase)));
    } catch { localStorage.removeItem(STORAGE); }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE, JSON.stringify(projects)); }, [projects, ready]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.getElementById('project-search')?.focus(); setView('projects'); }
      if (event.key === 'Escape') { setComposer(false); setSettings(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const visible = useMemo(() => projects.filter(p => (p.name + ' ' + p.client).toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.createdAt - a.createdAt), [projects, query]);
  const active = projects.filter(p => p.phase !== 'Done');
  function createProject(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const project: Project = { id: crypto.randomUUID(), name: name.trim(), client: client.trim(), phase: 'Idea', createdAt: Date.now() };
    setProjects(current => [project, ...current]); setName(''); setClient(''); setComposer(false); setView('projects');
    setNotice('Projekt lokal erstellt · noch nicht mit Supabase verbunden');
  }
  function cyclePhase(id: string) {
    const phases: Project['phase'][] = ['Idea', 'In progress', 'Done'];
    setProjects(current => current.map(p => p.id === id ? { ...p, phase: phases[(phases.indexOf(p.phase) + 1) % phases.length] } : p));
  }
  function removeProject(id: string) {
    if (!window.confirm('Dieses lokale Testprojekt wirklich löschen?')) return;
    setProjects(current => current.filter(p => p.id !== id));
    setNotice('Lokales Projekt gelöscht');
  }
  return <div className={'hive-app theme-' + accent}>
    <header className="chrome"><div className="chrome-left"><a className="wordmark" href="/" aria-label="Hive Home"><span className="mark">h<span>•</span></span><span>hive</span></a><span className="chrome-sep"/><button className="workspace-trigger" onClick={() => setNotice('Business-Switcher folgt nach sicherer Datenbankanbindung')}><span className="workspace-monogram">M</span> Michias Tegegne <ChevronDown size={13}/></button></div><div className="chrome-right"><span className="preview-label"><span/> PREVIEW MODE</span><a href="/studio" className="ghost-button">Business Studio <ArrowRight size={14}/></a><button className="icon-button" aria-label="Einstellungen" onClick={() => setSettings(true)}><Settings2 size={17}/></button><span className="user-circle">MT</span></div></header>
    <div className="app-frame"><aside className="rail"><div className="rail-group"><button className={'rail-item ' + (view === 'home' ? 'selected' : '')} onClick={() => setView('home')}><span className="rail-glyph">⌂</span> Home</button><button className={'rail-item ' + (view === 'projects' ? 'selected' : '')} onClick={() => setView('projects')}><FolderOpen size={17}/> Projects <span className="rail-count">{projects.length}</span></button><button className={'rail-item ' + (view === 'activity' ? 'selected' : '')} onClick={() => setView('activity')}><Circle size={16}/> Activity</button></div><div className="rail-section"><span>YOUR SPACE</span><button onClick={() => setComposer(true)} aria-label="Projekt hinzufügen"><Plus size={15}/></button></div><div className="rail-empty"><div className="rail-line"/><span>Build what matters.</span><small>Your work, organised beautifully.</small></div><div className="rail-spacer"/><button className="rail-footer" onClick={() => setSettings(true)}><SlidersHorizontal size={16}/> Personalise Hive <ArrowUpRight size={15}/></button></aside>
    <main className="surface">
      <div className="surface-head"><div className="breadcrumbs"><span>Workspace</span><span className="breadcrumb-divider">/</span><strong>{view === 'home' ? 'Home' : view === 'projects' ? 'Projects' : 'Activity'}</strong></div><div className="surface-tools"><span className="local-flag">Local prototype</span><button className="ghost-button" onClick={() => setComposer(true)}><Plus size={15}/> New project</button></div></div>
      <div className="surface-content">{view === 'home' ? <>
        <div className="hero"><span className="overline">A BETTER WAY TO WORK <span className="overline-line"/></span><h1>Make space<br/>for <em>great work.</em></h1><p>One calm place for your clients, projects and everything in between. Built around the way you create.</p><div className="hero-actions"><button className="dark-button" onClick={() => setComposer(true)}>Create a project <ArrowUpRight size={17}/></button><button className="text-button" onClick={() => setView('projects')}>Explore workspace <ArrowRight size={16}/></button></div><span className="hero-index">H / 001</span></div>
        <div className="home-content"><div className="content-head"><div><span className="tiny-label">YOUR DESK</span><h2>Where things stand<span className="tiny-star">✳</span></h2></div><button className="text-button" onClick={() => setView('projects')}>All projects <ArrowUpRight size={15}/></button></div><div className="work-grid"><button className="work-card card-main" onClick={() => setView('projects')}><span className="work-card-top">01 / WORK IN MOTION <ArrowUpRight size={19}/></span><strong>{ready ? active.length.toString().padStart(2,'0') : '—'}</strong><span>Open projects</span><div className="work-card-bottom">Keep your momentum going <ArrowRight size={16}/></div></button><button className="work-card card-outline" onClick={() => setComposer(true)}><span className="work-card-top">02 / NEXT UP <Plus size={19}/></span><div className="outline-center"><div className="outlined-plus"><Plus size={26}/></div><strong>Start something new.</strong><p>Your next great idea begins here.</p></div><span className="work-card-bottom">New project <ArrowUpRight size={16}/></span></button></div><div className="bottom-note"><span className="note-symbol">✳</span><div><strong>Made to fit you.</strong><p>Hive is being rebuilt as a flexible creative workspace. Personalise your experience using the controls in the sidebar.</p></div><button className="text-button" onClick={() => setSettings(true)}>Customise <ArrowUpRight size={15}/></button></div></div>
      </> : view === 'projects' ? <>
        <div className="module-top"><span className="overline">YOUR WORK / 01</span><div className="module-title"><div><h1>Projects<span className="title-dot">.</span></h1><p>Everything you are making, from first thought to final delivery.</p></div><button className="dark-button" onClick={() => setComposer(true)}><Plus size={16}/> New project</button></div></div>
        <div className="project-toolbar"><label className="searchbox"><Search size={17}/><input id="project-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search projects…" /><kbd>⌘ K</kbd></label><div className="view-switch"><button aria-label="Listenansicht" aria-pressed={display === 'list'} onClick={() => setDisplay('list')} className={display === 'list' ? 'on' : ''}><List size={17}/></button><button aria-label="Kachelansicht" aria-pressed={display === 'grid'} onClick={() => setDisplay('grid')} className={display === 'grid' ? 'on' : ''}><LayoutGrid size={17}/></button></div></div>
        {visible.length ? <div className={display === 'grid' ? 'project-collection grid-view' : 'project-collection'}>{visible.map((p,i) => <article className="project-row" key={p.id}><span className="project-no">{String(i + 1).padStart(2,'0')}</span><div className="project-text"><strong>{p.name}</strong><small>{p.client || 'Independent project'}</small></div><button className={'phase phase-' + p.phase.replace(' ','-').toLowerCase()} onClick={() => cyclePhase(p.id)} title="Status wechseln"><span/> {p.phase}</button><button className="remove-button" onClick={() => removeProject(p.id)} aria-label={'Projekt '+p.name+' löschen'} title="Lokales Testprojekt löschen"><Trash2 size={16}/></button></article>)}</div> : <div className="module-empty"><div className="empty-graphic"><span/><span/><span/></div><strong>{query ? 'No matching projects.' : 'A blank canvas. On purpose.'}</strong><p>{query ? 'Try a different search.' : 'Create your first project to see your workspace come alive.'}</p><button onClick={() => { if(query) setQuery(''); else setComposer(true); }} className="text-button">{query ? 'Clear search' : 'Create project'} <ArrowUpRight size={16}/></button></div>}
        <p className="local-disclaimer">PROTOTYPE: Projects are stored only in this browser. No real clients, invoices or Supabase data are connected.</p>
      </> : <><div className="module-top"><span className="overline">YOUR WORK / 02</span><div className="module-title"><div><h1>Activity<span className="title-dot">.</span></h1><p>A clear picture of what is happening across your space.</p></div></div></div><div className="module-empty"><div className="empty-graphic"><span/><span/><span/></div><strong>Nothing to catch up on.</strong><p>Activity will appear here once the secure backend is connected.</p></div></>}
      </div>
      <footer className="surface-footer"><span>HIVE — WORK YOUR WAY</span><span>EXPERIMENTAL BUILD / NO PRODUCTION DATA</span></footer>
    </main></div>
    {notice && <div role="status" className="notice">{notice}<button onClick={() => setNotice('')} aria-label="Schliessen"><X size={15}/></button></div>}
    {composer && <div className="overlay" onMouseDown={e => { if(e.target === e.currentTarget) setComposer(false); }}><form className="modal" onSubmit={createProject}><div className="modal-top"><span>HIVE / NEW PROJECT</span><button type="button" onClick={() => setComposer(false)} aria-label="Schliessen"><X size={20}/></button></div><h2>Something new.</h2><p>Start small. Make something remarkable.</p><label>PROJECT NAME<input autoFocus maxLength={120} required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Autumn campaign"/></label><label>CLIENT <span>(OPTIONAL)</span><input maxLength={120} value={client} onChange={e => setClient(e.target.value)} placeholder="e.g. Studio North"/></label><div className="modal-actions"><button type="button" className="text-button" onClick={() => setComposer(false)}>Cancel</button><button type="submit" className="dark-button">Create project <ArrowRight size={16}/></button></div><small className="modal-footnote">Stored locally for UI testing. Not shared or synced.</small></form></div>}
    {settings && <div className="overlay" onMouseDown={e => { if(e.target === e.currentTarget) setSettings(false); }}><div className="modal setting-modal"><div className="modal-top"><span>HIVE / YOUR SPACE</span><button onClick={() => setSettings(false)} aria-label="Schliessen"><X size={20}/></button></div><h2>Make it yours.</h2><p>Choose a neutral visual direction. Full per-business branding will follow with accounts and database settings.</p><div className="theme-options"><button className={accent === 'black' ? 'chosen' : ''} onClick={() => setAccent('black')}><span className="swatch black"/><span>Ink</span>{accent === 'black' && <Check size={16}/>}</button><button className={accent === 'stone' ? 'chosen' : ''} onClick={() => setAccent('stone')}><span className="swatch stone"/><span>Stone</span>{accent === 'stone' && <Check size={16}/>}</button></div><small className="modal-footnote">Prototype preference applies to this visit only.</small></div></div>}
  </div>;
}

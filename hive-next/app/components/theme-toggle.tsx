'use client';

import { useEffect, useRef, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';

type Preference = 'auto' | 'light' | 'dark';
const preferenceKey = 'hive-appearance';

export default function ThemeToggle({ expanded = false }: { expanded?: boolean }) {
  const [preference, setPreference] = useState<Preference>('auto');
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      let stored: string | null = null;
      try { stored = localStorage.getItem(preferenceKey); } catch {}
      const next = stored === 'light' || stored === 'dark' ? stored : 'auto';
      setPreference(next);
      document.documentElement.dataset.theme = next === 'auto' ? (media.matches ? 'dark' : 'light') : next;
    };
    sync();
    media.addEventListener('change', sync);
    window.addEventListener('storage', sync);
    window.addEventListener('hive-appearance-change', sync);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('hive-appearance-change', sync);
    };
  }, []);
  function select(next: Preference) {
    setPreference(next);
    document.documentElement.dataset.theme = next === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : next;
    try { localStorage.setItem(preferenceKey, next); } catch {}
    window.dispatchEvent(new Event('hive-appearance-change'));
  }
  const controls = <fieldset className="hive-appearance-options"><legend>Erscheinungsbild</legend>
    <p>Automatisch folgt der Darstellung deines Geräts. Deine Auswahl wird auf diesem Gerät gespeichert.</p>
    <div>{([['auto','Automatisch',Monitor],['light','Hell',Sun],['dark','Dunkel',Moon]] as const).map(([value,label,Icon]) =>
      <label key={value} className="hive-appearance-option" data-selected={preference === value}>
        <input type="radio" name={expanded ? 'appearance-settings' : 'appearance-quick'} value={value} checked={preference === value} onChange={() => select(value)}/>
        <Icon size={22} aria-hidden="true"/><span>{label}</span>
      </label>)}</div>
  </fieldset>;
  if (expanded) return controls;
  return <div className="hive-appearance-quick" onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } }}>
    <button ref={trigger} className="hive-theme-toggle" type="button" aria-label="Erscheinungsbild einstellen" aria-expanded={open} onClick={() => setOpen(!open)}><Sun size={16} aria-hidden="true"/></button>
    {open && <><button type="button" className="hive-appearance-dismiss" aria-label="Erscheinungsbild schließen" onClick={() => setOpen(false)}/><div className="hive-appearance-popover">{controls}</div></>}
  </div>;
}

'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const preferenceKey = 'hive-appearance';
type Theme = 'light' | 'dark';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    const sync = (event: StorageEvent) => {
      if (event.key !== preferenceKey) return;
      const next = event.newValue === 'light' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem(preferenceKey, next); } catch { /* The current page still switches when storage is unavailable. */ }
  }

  return <button className="hive-theme-toggle" type="button" onClick={toggle}
    aria-label={theme === 'dark' ? 'Hellen Modus aktivieren' : 'Dunklen Modus aktivieren'}
    title={theme === 'dark' ? 'Hellen Modus aktivieren' : 'Dunklen Modus aktivieren'}
    aria-pressed={theme === 'dark'}>
    {theme === 'dark' ? <Sun size={16} aria-hidden="true"/> : <Moon size={16} aria-hidden="true"/>}
  </button>;
}

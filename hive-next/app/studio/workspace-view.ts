'use client';

import { useCallback, useEffect, useState } from 'react';

export const workspaceViews = ['businesses','overview','customers','projects','invoices','offers','catalog','emails','portal','activity','team','branding'] as const;
export type WorkspaceView = typeof workspaceViews[number];
const readView = (): WorkspaceView => {
  const value = new URLSearchParams(window.location.search).get('view');
  return workspaceViews.includes(value as WorkspaceView) ? value as WorkspaceView : 'overview';
};

// Keep browser back/forward and reload attached to the visible module.
export function useWorkspaceView() {
  const [view, update] = useState<WorkspaceView>('overview');
  useEffect(() => {
    const sync = () => update(readView());
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const navigate = useCallback((next: WorkspaceView) => {
    update(next);
    if (readView() === next) return;
    const url = new URL(window.location.href);
    if (next === 'overview') url.searchParams.delete('view');
    else url.searchParams.set('view', next);
    window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);
  return [view, navigate] as const;
}

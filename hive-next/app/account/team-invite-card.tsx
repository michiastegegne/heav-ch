'use client';

import { useEffect, useState } from 'react';
import { Check, Link2, Users } from 'lucide-react';

export default function TeamInviteCard() {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get('team_invite') || '';
    if (!value.startsWith('hive_team_')) return;
    setToken(value);
    params.delete('team_invite');
    const clean = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      clean ? `${window.location.pathname}?${clean}${window.location.hash}` : `${window.location.pathname}${window.location.hash}`,
    );
  }, []);

  async function claim() {
    if (busy || !token.trim()) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/hive/team/invite/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Team-Einladung konnte nicht angenommen werden.');
      setJoined(true);
      setMessage('Einladung angenommen. Dein Workspace ist jetzt verfügbar.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Team-Einladung konnte nicht angenommen werden.');
    } finally {
      setBusy(false);
    }
  }

  if (!token && !joined) return null;

  return (
    <section className="account-link-card" aria-label="Team-Einladung">
      <div className="account-link-head">
        <span><Users size={18}/></span>
        <div>
          <strong>Team-Einladung</strong>
          <small>Trete dem eingeladenen Business mit deinem aktuellen Hive-Login bei.</small>
        </div>
      </div>

      {joined ? (
        <div className="account-link-success"><Check size={16}/> Einladung angenommen.</div>
      ) : (
        <div className="account-link-form">
          <label>
            Invite-Code
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="hive_team_…"
            />
          </label>
          <button type="button" onClick={() => void claim()} disabled={busy || !token.trim()}>
            <Link2 size={15}/> {busy ? 'Wird angenommen …' : 'Einladung annehmen'}
          </button>
        </div>
      )}

      {message && <p className="account-link-message" role="status">{message}</p>}
      {joined && <a className="account-link-open" href="/studio">Studio öffnen →</a>}
    </section>
  );
}

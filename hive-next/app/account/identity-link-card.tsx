'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Link2, RefreshCw, ShieldCheck } from 'lucide-react';

type Props = { provider: 'supabase' | 'clerk' };
type Status = { provider: 'supabase' | 'clerk'; linked: boolean; canPrepare: boolean };

export default function IdentityLinkCard({ provider }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const [claimToken, setClaimToken] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [message, setMessage] = useState('');
  const [clerkMode, setClerkMode] = useState<'link'|'new'>('link');
  const [businessName, setBusinessName] = useState('');
  const [invoicePrefix, setInvoicePrefix] = useState('HIVE');

  async function refresh() {
    try {
      const response = await fetch('/api/auth/identity-link', { cache: 'no-store' });
      const data = await response.json();
      if (response.ok) setStatus(data);
    } catch {
      // The main account UI remains usable if migration status is unavailable.
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function prepare() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/identity-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Migrationscode konnte nicht erstellt werden.');
      setToken(data.token);
      setExpiresAt(data.expiresAt);
      setMessage('Einmalcode erstellt. Er wird nicht im Browser gespeichert.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Migrationscode konnte nicht erstellt werden.');
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    if (busy || !claimToken.trim()) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/identity-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: claimToken.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Account konnte nicht verknüpft werden.');
      setClaimToken('');
      setMessage('Hive-Daten erfolgreich mit diesem Login verbunden.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Account konnte nicht verknüpft werden.');
    } finally {
      setBusy(false);
    }
  }

  async function startNewAccount() {
    if (busy || businessName.trim().length < 2) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: businessName.trim(),
          invoicePrefix: invoicePrefix.trim().toUpperCase() || 'HIVE',
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Hive-Account konnte nicht erstellt werden.');
      setMessage('Hive-Account erstellt. Studio wird geöffnet …');
      window.location.assign('/studio');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Hive-Account konnte nicht erstellt werden.');
      setBusy(false);
    }
  }

  async function copyToken() {
    if (!token || !navigator.clipboard) return;
    await navigator.clipboard.writeText(token);
    setMessage('Code kopiert.');
  }

  return (
    <section className="account-link-card" aria-label="Login-Migration">
      <div className="account-link-head">
        <span><ShieldCheck size={18}/></span>
        <div>
          <strong>{provider === 'clerk' ? 'Hive-Daten verbinden' : 'Clerk-Migration vorbereiten'}</strong>
          <small>{provider === 'clerk' ? 'Verknüpfe diesen Login einmalig mit deinem bestehenden Hive-Account.' : 'Erzeuge vor dem Wechsel einen kurzlebigen Einmalcode.'}</small>
        </div>
      </div>

      {provider === 'clerk' && status?.linked ? (
        <div className="account-link-success"><Check size={16}/> Bestehende Hive-Daten sind verbunden.</div>
      ) : provider === 'clerk' ? (
        <div className="account-link-clerk">
          <div className="account-link-choice" role="tablist" aria-label="Hive-Account einrichten">
            <button type="button" role="tab" aria-selected={clerkMode === 'link'} onClick={() => setClerkMode('link')}>Bestehende Daten</button>
            <button type="button" role="tab" aria-selected={clerkMode === 'new'} onClick={() => setClerkMode('new')}>Neu starten</button>
          </div>

          {clerkMode === 'link' ? (
            <div className="account-link-form">
              <p>Nutze diesen Weg, wenn du bereits Hive-Daten aus deinem bisherigen Login behalten willst.</p>
              <label>
                Migrationscode
                <input
                  value={claimToken}
                  onChange={(event) => setClaimToken(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="hive_…"
                />
              </label>
              <button type="button" onClick={() => void claim()} disabled={busy || !claimToken.trim()}>
                <Link2 size={15}/> {busy ? 'Verbinden …' : 'Bestehenden Account verbinden'}
              </button>
            </div>
          ) : (
            <div className="account-link-form">
              <p>Nur wählen, wenn du noch keine bestehenden Hive-Daten hast. Dadurch entsteht ein neuer, separater Hive-Account.</p>
              <label>
                Erstes Business
                <input
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  autoComplete="organization"
                  placeholder="z.B. Wedding Vocals"
                />
              </label>
              <label>
                Rechnungspräfix
                <input
                  value={invoicePrefix}
                  onChange={(event) => setInvoicePrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12))}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="HIVE"
                />
              </label>
              <button type="button" onClick={() => void startNewAccount()} disabled={busy || businessName.trim().length < 2}>
                <Link2 size={15}/> {busy ? 'Wird erstellt …' : 'Neuen Hive-Account starten'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="account-link-form">
          <p>Der Code ist 15 Minuten gültig und kann genau einmal eingelöst werden.</p>
          <button type="button" onClick={() => void prepare()} disabled={busy}>
            <RefreshCw size={15}/> {busy ? 'Erstellen …' : 'Migrationscode erstellen'}
          </button>
          {token && <div className="account-link-token">
            <code>{token}</code>
            <button type="button" aria-label="Migrationscode kopieren" onClick={() => void copyToken()}><Copy size={15}/></button>
            {expiresAt && <small>Gültig bis {new Date(expiresAt).toLocaleTimeString('de-CH', { hour:'2-digit', minute:'2-digit' })}</small>}
          </div>}
        </div>
      )}

      {message && <p className="account-link-message" role="status">{message}</p>}
    </section>
  );
}

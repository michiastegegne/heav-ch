'use client';
import { useEffect, useState } from 'react';
import { passkeyRequest, runPasskeyCeremony, passkeyError, supportsPasskeys } from '@/lib/hive/passkeys-browser';

type Passkey = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };
export default function PasskeyManager() {
  const [keys, setKeys] = useState<Passkey[]>([]);
  const [pending, setPending] = useState(true);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function reload() { setKeys(await passkeyRequest()); }
  useEffect(() => {
    let active = true;
    setSupported(supportsPasskeys());
    passkeyRequest().then(data => { if (active) setKeys(data); })
      .catch(error => { if (active) setError(passkeyError(error)); })
      .finally(() => { if (active) setPending(false); });
    return () => { active = false; };
  }, []);
  async function run(task: () => Promise<unknown>, success: string) {
    if (pending) return;
    setPending(true); setError(''); setMessage('');
    try { await task(); await reload(); setMessage(success); }
    catch (error) { setError(passkeyError(error)); }
    finally { setPending(false); }
  }
  return <section className="auth-setup passkey-settings" aria-busy={pending}>
    <span>PASSKEYS</span><h2>Sicher anmelden.</h2>
    <p>Verwende Face ID, Touch ID, deinen Gerätecode oder einen Sicherheitsschlüssel.</p>
    <button type="button" disabled={pending || !supported} onClick={() => run(() => runPasskeyCeremony('register'), 'Passkey hinzugefügt.')}>Passkey hinzufügen</button>
    {!supported && <p>Zum Hinzufügen brauchst du einen unterstützten Browser mit sicherer Verbindung.</p>}
    {error && <p className="hive-auth-error" role="alert">{error}</p>}
    <p role="status">{message || (pending ? 'Passkeys werden geladen …' : '')}</p>
    {!pending && !error && keys.length === 0 && <p>Noch keine Passkeys. Melde dich zuerst mit E-Mail und Passwort an und füge hier deinen ersten Passkey hinzu.</p>}
    {keys.map(key => <form className="hive-login-form" key={key.id} onSubmit={event => {
      event.preventDefault();
      const friendlyName = String(new FormData(event.currentTarget).get('name') || '').trim();
      if (friendlyName) run(() => passkeyRequest({ action: 'rename', passkeyId: key.id, friendlyName }), 'Name gespeichert.');
    }}>
      <label htmlFor={`key-${key.id}`}>Name<input id={`key-${key.id}`} name="name" defaultValue={key.friendly_name || 'Mein Passkey'} required maxLength={120} disabled={pending}/></label>
      <small>Erstellt: {new Date(key.created_at).toLocaleDateString('de-CH')}{key.last_used_at ? ` · Zuletzt verwendet: ${new Date(key.last_used_at).toLocaleDateString('de-CH')}` : ''}</small>
      <button type="submit" disabled={pending}>Name speichern</button>
      <button type="button" disabled={pending} onClick={() => {
        if (window.confirm('Diesen Passkey entfernen? Die Anmeldung mit E-Mail und Passwort bleibt verfügbar.')) run(() => passkeyRequest({ action: 'delete', passkeyId: key.id }), 'Passkey entfernt.');
      }}>Passkey entfernen</button>
    </form>)}
    <p>Deine Anmeldung mit E-Mail und Passwort bleibt verfügbar. Verwende sie auch, wenn du keinen Zugriff auf deinen Passkey hast.</p>
  </section>;
}

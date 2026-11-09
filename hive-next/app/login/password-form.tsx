'use client';

import { FormEvent, useEffect, useState } from 'react';
import { runPasskeyCeremony, supportsPasskeys, passkeyError } from '@/lib/hive/passkeys-browser';

export default function PasswordForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(false);
  useEffect(() => { setSupported(supportsPasskeys()); }, []);
  async function loginPasskey() {
    if (pending) return;
    setPending(true); setError('');
    try { await runPasskeyCeremony('login'); window.location.assign('/studio'); }
    catch (failure) { setError(passkeyError(failure)); setPending(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fields.get('email'), password: fields.get('password') }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Anmeldung fehlgeschlagen.');
      window.location.assign('/studio');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Anmeldung fehlgeschlagen.');
      setPending(false);
    }
  }
  return <form className="hive-login-form" onSubmit={submit} aria-busy={pending}>
    <span className="auth-kicker">DEIN WORKSPACE</span>
    <h2>Willkommen zurück.</h2>
    <p>Melde dich mit deinem bestehenden Konto an.</p>
    <button type="button" onClick={loginPasskey} disabled={pending || !supported}>Mit Passkey anmelden <span aria-hidden="true">↗</span></button>
    <small>{supported ? 'Mit Face ID, Touch ID oder deinem Gerätecode.' : 'Passkeys benötigen einen unterstützten Browser und eine sichere Verbindung.'}</small>
    <p>Oder mit E-Mail und Passwort</p>
    <label htmlFor="login-email">E-Mail<input id="login-email" name="email" type="email" autoComplete="username" required disabled={pending}/></label>
    <label htmlFor="login-password">Passwort<input id="login-password" name="password" type="password" autoComplete="current-password" required disabled={pending}/></label>
    {error && <p className="hive-auth-error" role="alert">{error}</p>}
    <button type="submit" disabled={pending}>{pending ? 'Anmelden …' : 'Anmelden'} <span aria-hidden="true">↗</span></button>
    <small>Deine bestehenden Geschäftsdaten bleiben geschützt.</small>
  </form>;
}

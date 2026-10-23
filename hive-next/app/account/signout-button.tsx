'use client';
import { useState } from 'react';

export default function SignoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function signout() {
    setPending(true);
    try {
      const response = await fetch('/api/auth/session', { method: 'DELETE' });
      if (!response.ok) throw new Error('Abmelden fehlgeschlagen. Bitte versuche es erneut.');
      window.location.assign('/login');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Abmelden fehlgeschlagen.'); setPending(false); }
  }
  return <div><button className="hive-signout" onClick={signout} disabled={pending}>{pending ? 'Abmelden …' : 'Abmelden'}</button>{error && <p role="alert">{error}</p>}</div>;
}

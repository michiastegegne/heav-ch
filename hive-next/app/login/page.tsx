'use client';
import { FormEvent, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const client = createSupabaseBrowserClient();
    if (!client) { setMessage('Backend ist noch nicht konfiguriert.'); return; }
    setWorking(true);
    try {
      const { error } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + '/auth/callback' }
      });
      setMessage(error ? 'Login-E-Mail konnte nicht gesendet werden.' : 'Prüfe dein E-Mail-Postfach für den Login-Link.');
    } catch { setMessage('Anmeldung derzeit nicht verfügbar.'); }
    finally { setWorking(false); }
  }
  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#f7f7f5'}}>
    <form onSubmit={submit} style={{width:'min(100%,420px)',padding:35,background:'#fff',border:'1px solid #e4e4e0'}}>
      <a href="/" style={{fontWeight:800,fontSize:24,textDecoration:'none',color:'#191919'}}>hive.</a>
      <h1 style={{fontSize:34,margin:'32px 0 8px'}}>Willkommen zurück.</h1>
      <p style={{fontSize:13,color:'#777',lineHeight:1.7,marginBottom:30}}>Melde dich sicher bei deinem Business-Workspace an.</p>
      <label htmlFor="email" style={{display:'block',fontSize:12,fontWeight:700,marginBottom:8}}>E-Mail-Adresse</label>
      <input id="email" required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={{display:'block',width:'100%',fontSize:16,padding:14,border:'1px solid #ddd'}} />
      <button type="submit" disabled={working} style={{background:'#191919',color:'#fff',width:'100%',padding:15,border:0,marginTop:20}}>{working?'Einen Moment…':'Login-Link senden'}</button>
      {message && <p role="status" style={{fontSize:12,marginTop:18}}>{message}</p>}
    </form>
  </main>;
}

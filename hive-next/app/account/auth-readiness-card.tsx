'use client';

import { useEffect, useState } from 'react';
import { Check, CircleAlert, RefreshCw, ShieldCheck } from 'lucide-react';

type Readiness = {
  provider:'supabase'|'clerk';
  ready:boolean;
  clerkCutoverReady:boolean;
  clerk:{configured:boolean;bridgeEnabled:boolean};
  identityMigration:{enabled:boolean;declaredReady:boolean};
  supabase:{configured:boolean};
};

export default function AuthReadinessCard() {
  const [state,setState]=useState<Readiness|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function refresh(){
    if(busy)return;
    setBusy(true);
    setError('');
    try{
      const response=await fetch('/api/auth/readiness',{cache:'no-store'});
      const data=await response.json();
      // 503 is a valid "not ready yet" state for this read-only status surface.
      if(!response.ok && response.status!==503) throw new Error(data.error||'Status konnte nicht geladen werden.');
      setState(data);
    }catch(failure){
      setError(failure instanceof Error?failure.message:'Status konnte nicht geladen werden.');
    }finally{
      setBusy(false);
    }
  }

  useEffect(()=>{void refresh();},[]);

  const checks=state ? [
    ['Clerk verbunden',state.clerk.configured],
    ['Supabase DB verbunden',state.supabase.configured],
    ['Identity-Bridge freigegeben',state.clerk.bridgeEnabled],
    ['Identity-Migration freigegeben',state.identityMigration.declaredReady],
  ] as const : [];

  return <section className="account-link-card auth-readiness-card" aria-label="Auth Cutover Status">
    <div className="account-link-head">
      <span><ShieldCheck size={18}/></span>
      <div>
        <strong>Auth Cutover</strong>
        <small>Read-only Preflight für Apple, E-Mail-Code und Passkeys. Keine Schlüssel oder Secret-Werte werden angezeigt.</small>
      </div>
      <button className="auth-readiness-refresh" type="button" aria-label="Auth-Status aktualisieren" onClick={()=>void refresh()} disabled={busy}>
        <RefreshCw size={15}/>
      </button>
    </div>

    {state ? <>
      <div className="auth-readiness-grid">
        {checks.map(([label,ok])=><div key={label} className="auth-readiness-item" data-ready={ok}>
          <span>{ok?<Check size={14}/>:<CircleAlert size={14}/>}</span>
          <strong>{label}</strong>
          <small>{ok?'Bereit':'Offen'}</small>
        </div>)}
      </div>
      <div className="auth-readiness-result" data-ready={state.clerkCutoverReady}>
        <strong>{state.clerkCutoverReady?'Clerk-Cutover technisch freigegeben':'Clerk bleibt sicher gesperrt'}</strong>
        <small>{state.clerkCutoverReady
          ? 'Die Code-Gates sind erfüllt. Der Provider kann kontrolliert umgeschaltet werden.'
          : 'Hive bleibt beim bestehenden Login, bis alle Sicherheits-Gates erfüllt sind.'}</small>
      </div>
    </>:error?<p className="account-link-message" role="status">{error}</p>:<p className="account-link-message" role="status">Status wird geprüft …</p>}
  </section>;
}

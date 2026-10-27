'use client';
import { useEffect, useState } from 'react';
import { ArrowUpFromLine, Check, PlusSquare, Share, Smartphone } from 'lucide-react';
type InstallPrompt = Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export default function InstallGuide(){
 const [installed,setInstalled]=useState(false);
 const [prompt,setPrompt]=useState<InstallPrompt|null>(null);
 const [status,setStatus]=useState('');
 useEffect(()=>{
  const standalone=matchMedia('(display-mode: standalone)');
  const update=()=>setInstalled(standalone.matches||Boolean((navigator as Navigator & {standalone?:boolean}).standalone));
  const capture=(event:Event)=>{event.preventDefault();setPrompt(event as InstallPrompt);};
  const complete=()=>{setInstalled(true);setPrompt(null);};
  update();standalone.addEventListener('change',update);
  window.addEventListener('beforeinstallprompt',capture);window.addEventListener('appinstalled',complete);
  return()=>{standalone.removeEventListener('change',update);window.removeEventListener('beforeinstallprompt',capture);window.removeEventListener('appinstalled',complete);};
 },[]);
 async function install(){
  if(!prompt)return;
  try{await prompt.prompt();const choice=await prompt.userChoice;setStatus(choice.outcome==='accepted'?'Installation angefordert.':'Du kannst Hive später installieren.');setPrompt(null);}catch{setStatus('Bitte über das Browsermenü installieren.');}
 }
 return <div className="hive-install-guide">
  <div className="hive-install-icon"><Smartphone size={36}/></div>
  <p>Dein Workspace. Direkt auf deinem Home-Bildschirm.</p>
  {installed?<div className="hive-install-success"><Check size={20}/>Hive läuft bereits als Webapp.</div>:<>
   <ol><li><span><Share size={19}/></span><div><strong>In Safari öffnen</strong><p>Tippe auf das Teilen-Symbol in der Symbolleiste. Bei einer Vorschau zuerst mit deinem Vercel-Konto anmelden.</p></div></li><li><span><PlusSquare size={19}/></span><div><strong>Zum Home-Bildschirm</strong><p>Wähle „Zum Home-Bildschirm“ und aktiviere „Als Web-App öffnen“, wenn diese Option erscheint.</p></div></li><li><span><ArrowUpFromLine size={19}/></span><div><strong>Hive starten</strong><p>Tippe auf Hinzufügen. Öffne Hive danach über das neue App-Symbol.</p></div></li></ol>
   {prompt&&<button className="hsv-primary" onClick={()=>void install()}>Hive installieren<Smartphone size={17}/></button>}
  </>}
  <p className="hive-install-note">Deine bestehende Anmeldung und alle Funktionen bleiben erhalten. Für Daten und Änderungen benötigst du eine Internetverbindung.</p>
  <div role="status">{status}</div>
 </div>;
}

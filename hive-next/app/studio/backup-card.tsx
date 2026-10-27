'use client';
import { useRef, useState } from 'react';
import { Download, ShieldCheck } from 'lucide-react';
import { encryptBackup, decryptBackup } from '@/lib/hive/backup-crypto.mjs';
import './backup-card.css';
export default function BackupCard({workspaceId, name}: {workspaceId:string; name:string}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const lock = useRef(false);
  async function download() {
    if (lock.current) return;
    if (password.length < 16 || password !== confirmation) { setStatus('Bitte ein übereinstimmendes Passwort mit mindestens 16 Zeichen eingeben.'); return; }
    lock.current = true; setBusy(true); setStatus('Daten werden gelesen und verschlüsselt …');
    try {
      const response = await fetch(`/api/hive/backup?workspace=${encodeURIComponent(workspaceId)}`, {cache:'no-store'});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sicherung fehlgeschlagen.');
      const encrypted = await encryptBackup(data, password);
      // Validate the complete crypto round trip before offering a download.
      const verified = await decryptBackup(encrypted, password) as {workspaceId:string};
      if (verified.workspaceId !== workspaceId) throw new Error('Sicherung konnte nicht geprüft werden.');
      const url = URL.createObjectURL(new Blob([JSON.stringify(encrypted)], {type:'application/json'}));
      const link = document.createElement('a'); link.href = url;
      link.download = `hive-${workspaceId}-${new Date().toISOString().replace(/[:.]/g,'-')}.hivebackup`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      setPassword(''); setConfirmation('');
      setStatus('Verschlüsselte Sicherung geprüft und Download gestartet. Bewahre sie getrennt vom Passwort auf.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Sicherung fehlgeschlagen.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="hive-backup" aria-label="Datensicherung">
    <div className="hive-backup-heading"><ShieldCheck size={22}/><div><span>DEINE DATEN</span><h2>Eine Kopie. Unter deiner Kontrolle.</h2></div></div>
    <p>Sichere die Geschäftsdaten von <strong>{name}</strong> als verschlüsselte Datei auf deinem Gerät. Kostenlos, ohne zusätzlichen Dienst.</p>
    <div className="hive-backup-fields">
      <label>Sicherungspasswort<input aria-label="Sicherungspasswort" type="password" autoComplete="new-password" minLength={16} value={password} disabled={busy} onChange={event=>setPassword(event.target.value)}/><small>Mindestens 16 Zeichen. Das Passwort bleibt auf deinem Gerät.</small></label>
      <label>Passwort wiederholen<input type="password" autoComplete="new-password" value={confirmation} disabled={busy} onChange={event=>setConfirmation(event.target.value)}/></label>
    </div>
    <button type="button" className="hsv-outline" disabled={busy || password.length < 16 || password !== confirmation} onClick={()=>void download()}><Download size={16}/>{busy ? 'Sicherung wird erstellt …' : 'Verschlüsselt herunterladen'}</button>
    <p className="hive-backup-status" role="status">{status}</p>
    <details><summary>Was ist enthalten?</summary><p>Kunden, Projekte, Aufgaben, Rechnungen, Offerten, Positionen, Verlauf, Leistungen, E-Mail-Protokolle und Business-Einstellungen. Dateiverweise sind enthalten; hochgeladene Dateien, Anmeldekonten und offene Einladungen musst du separat sichern. Der Export liest Tabellen nacheinander und ist kein vollständiges Datenbankabbild.</p><p>Bewahre das Passwort sicher auf. Ohne dieses Passwort kann die Datei nicht entschlüsselt werden. Eine Wiederherstellung erfolgt nach Prüfung durch den Betreiber.</p></details>
  </section>;
}

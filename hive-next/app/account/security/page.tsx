import { redirect } from 'next/navigation';
import ThemeToggle from '@/app/components/theme-toggle';
import { getHiveAuthState } from '@/lib/hive/auth-provider';
import { createSessionSupabaseClient } from '@/lib/supabase/session-server';
import { previewNoLogin } from '@/lib/hive/preview-mode';
import PasskeyManager from './passkey-manager';

export const dynamic = 'force-dynamic';
export default async function SecurityPage() {
  if (previewNoLogin()) redirect('/studio');
  const state = getHiveAuthState();
  if (!state.ready) redirect('/login');
  if (state.requested === 'clerk') redirect('/account');
  const { data: { user }, error } = await (await createSessionSupabaseClient()).auth.getUser();
  if (error || !user) redirect('/login');
  return <main className="account-shell">
    <header className="account-head"><a href="/account">← Konto</a><div className="account-appearance"><ThemeToggle/><strong>hive.</strong></div></header>
    <section className="account-content"><span className="auth-kicker">SECURITY</span><h1>Deine Sicherheit.</h1><p>{user.email}</p><PasskeyManager/></section>
  </main>;
}

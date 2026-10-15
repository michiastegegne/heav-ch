import ThemeToggle from '@/app/components/theme-toggle';
import { usesClerk } from '@/lib/hive/auth-provider';
import { createSessionSupabaseClient } from '@/lib/supabase/session-server';
import SignoutButton from './signout-button';
import { UserProfile } from '@clerk/nextjs';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const configured = usesClerk();

  const user = !configured ? (await (await createSessionSupabaseClient()).auth.getUser()).data.user : null;

  return (
    <main className="account-shell">
      <header className="account-head">
        <a href="/studio">← Studio</a>
        <div className="account-appearance"><ThemeToggle/><strong>hive.</strong></div>
      </header>
      <section className="account-content">
        <span className="auth-kicker">ACCOUNT & SECURITY</span>
        <h1>Dein Login.</h1>
        <p>Dein Konto und deine aktuelle Anmeldung.</p>

        {configured ? (
          <UserProfile
            routing="hash"
            appearance={{
              elements: {
                rootBox: 'account-clerk-root',
                cardBox: 'account-clerk-box',
                card: 'account-clerk-card',
              },
            }}
          />
        ) : (
          <div className="auth-setup">
            <span>ANGEMELDET</span>
            <h2>{user?.email}</h2>
            <p>Mit deinem bestehenden Konto verbunden.</p>
            <SignoutButton/>
          </div>
        )}
      </section>
    </main>
  );
}

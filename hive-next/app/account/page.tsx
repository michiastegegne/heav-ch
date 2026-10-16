import ThemeToggle from '@/app/components/theme-toggle';
import { getHiveAuthState } from '@/lib/hive/auth-provider';
import { createSessionSupabaseClient } from '@/lib/supabase/session-server';
import SignoutButton from './signout-button';
import { UserProfile } from '@clerk/nextjs';
import IdentityLinkCard from './identity-link-card';
import TeamInviteCard from './team-invite-card';
import AuthReadinessCard from './auth-readiness-card';

export const dynamic = 'force-dynamic';

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const teamInviteParam = Array.isArray(params.team_invite)
    ? params.team_invite[0]
    : params.team_invite;
  const hasTeamInvite = typeof teamInviteParam === 'string' && teamInviteParam.startsWith('hive_team_');
  const authState = getHiveAuthState();
  const configured = authState.requested === 'clerk' && authState.ready;
  const showIdentityMigration =
    authState.requested === 'clerk' ||
    process.env.HIVE_IDENTITY_MIGRATION_ENABLED === 'true';

  const user = !configured && authState.ready ? (await (await createSessionSupabaseClient()).auth.getUser()).data.user : null;

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
        <AuthReadinessCard/>
        {authState.ready && <TeamInviteCard/>}
        {authState.ready && showIdentityMigration && !hasTeamInvite && <IdentityLinkCard provider={authState.requested}/>} 
      </section>
    </main>
  );
}

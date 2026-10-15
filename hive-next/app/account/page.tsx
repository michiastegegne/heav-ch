import { UserProfile } from '@clerk/nextjs';

export default function AccountPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <main className="account-shell">
      <header className="account-head">
        <a href="/studio">← Studio</a>
        <strong>hive.</strong>
      </header>
      <section className="account-content">
        <span className="auth-kicker">ACCOUNT & SECURITY</span>
        <h1>Dein Login.</h1>
        <p>Verwalte deine Anmeldung, Geräte und – sobald in Clerk aktiviert – deine Passkeys.</p>

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
            <span>AUTH SETUP</span>
            <h2>Noch nicht verbunden.</h2>
            <p>Clerk ist im Code vorbereitet. Für Account- und Passkey-Verwaltung fehlen noch die Clerk-Schlüssel in Vercel.</p>
          </div>
        )}
      </section>
    </main>
  );
}

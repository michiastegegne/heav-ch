import { SignIn } from '@clerk/nextjs';

export default function LoginPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return (
    <main className="auth-shell">
      <section className="auth-brand">
        <a href="/" className="auth-wordmark">hive.</a>
        <div>
          <span className="auth-kicker">CREATIVE BUSINESS OS</span>
          <h1>Work starts here.</h1>
          <p>Apple, E-Mail und Passkeys – ohne klassisches Passwort-Chaos.</p>
        </div>
        <small>Dein Business. Deine Brand. Dein Workspace.</small>
      </section>
      <section className="auth-panel">
        {configured ? (
          <SignIn
            routing="hash"
            fallbackRedirectUrl="/studio"
            signUpFallbackRedirectUrl="/studio"
            withSignUp
            appearance={{
              elements: {
                rootBox: 'auth-clerk-root',
                cardBox: 'auth-clerk-box',
                card: 'auth-clerk-card',
                headerTitle: 'auth-clerk-title',
                headerSubtitle: 'auth-clerk-subtitle',
                socialButtonsBlockButton: 'auth-clerk-social',
                formButtonPrimary: 'auth-clerk-primary',
                formFieldInput: 'auth-clerk-input',
                footerActionLink: 'auth-clerk-link',
              },
            }}
          />
        ) : (
          <div className="auth-setup">
            <span>AUTH SETUP</span>
            <h2>Clerk ist vorbereitet.</h2>
            <p>Für die funktionierende Anmeldung fehlen nur noch die Clerk-Schlüssel in Vercel. Die bestehende Supabase-Datenbank wurde dafür nicht verändert.</p>
            <a href="/">Zur Preview</a>
          </div>
        )}
      </section>
    </main>
  );
}

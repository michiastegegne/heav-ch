import ThemeToggle from '@/app/components/theme-toggle';
import PasswordForm from './password-form';
import { usesClerk } from '@/lib/hive/auth-provider';
import { SignIn } from '@clerk/nextjs';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const configured = usesClerk();
  return (
    <main className="auth-shell">
      <section className="auth-brand">
        <div className="auth-brand-top"><a href="/" className="auth-wordmark">hive.</a><ThemeToggle/></div>
        <div>
          <span className="auth-kicker">CREATIVE BUSINESS OS</span>
          <h1>Work starts here.</h1>
          <p>Kunden, Projekte und Finanzen. An einem Ort.</p>
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
        ) : process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? (
          <PasswordForm/>
        ) : (
          <div className="auth-setup">
            <span>AUTH SETUP</span>
            <h2>Dein Workspace wird vorbereitet.</h2>
            <p>Die Verbindung zur Anmeldung ist noch nicht vollständig eingerichtet. Bitte versuche es später erneut.</p>
            <a href="/">Zur Preview</a>
          </div>
        )}
      </section>
    </main>
  );
}

import { usesClerk } from '@/lib/hive/auth-provider';
import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import './theme.css';

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export const metadata: Metadata = {
  title: 'Hive — Creative Business OS',
  description: 'Workspace for creative businesses',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const clerkConfigured = usesClerk();
  return (
    <html lang="de-CH" data-theme="dark" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: `try { document.documentElement.dataset.theme = localStorage.getItem('hive-appearance') === 'light' ? 'light' : 'dark'; } catch {}` }}/>
        {clerkConfigured ? (
          <ClerkProvider
            signInUrl="/login"
            signUpUrl="/login"
            afterSignOutUrl="/login"
            appearance={{
              variables: {
                colorPrimary: '#191919',
                colorBackground: '#ffffff',
                borderRadius: '6px',
              },
            }}
          >
            {children}
          </ClerkProvider>
        ) : children}
      </body>
    </html>
  );
}

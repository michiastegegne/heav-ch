import { getHiveAuthState } from '@/lib/hive/auth-provider';
import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import './theme.css';
import './mobile-auth.css';
import './glass-shell.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f0f3fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1424' },
  ],
};

export const metadata: Metadata = {
  title: 'Hive — Creative Business OS',
  description: 'Workspace for creative businesses',
  applicationName: 'Hive',
  icons: {apple: [{url:'/icons/hive-180.png',sizes:'180x180',type:'image/png'}]},
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Hive',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const authState = getHiveAuthState();
  const clerkConfigured = authState.requested === 'clerk' && authState.ready;
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

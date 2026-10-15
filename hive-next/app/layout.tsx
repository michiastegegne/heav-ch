import { usesClerk } from '@/lib/hive/auth-provider';
import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hive — Creative Business OS',
  description: 'Workspace for creative businesses',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const clerkConfigured = usesClerk();
  return (
    <html lang="de-CH">
      <body>
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

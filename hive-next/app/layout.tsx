import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Hive — Creative Business OS', description: 'Workspace for creative businesses' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de-CH"><body>{children}</body></html>;
}

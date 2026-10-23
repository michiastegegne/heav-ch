import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createSessionSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Die Anmeldung ist noch nicht eingerichtet.');
  const store = await cookies();
  return createServerClient(url, key, {
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        try { for (const { name, value, options } of items) store.set(name, value, options); }
        catch { /* Server Components refresh sessions through middleware. */ }
      },
    },
  });
}

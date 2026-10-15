import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client authenticated with the active Clerk session.
 *
 * IMPORTANT:
 * This client must only be used after the Supabase Clerk third-party auth
 * integration is enabled AND the legacy UUID-based RLS policies have been
 * migrated to a Clerk-compatible identity mapping.
 */
export async function createClerkSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) throw new Error('Supabase database is not configured');

  const { getToken, userId } = await auth();
  if (!userId) throw new Error('Authentication required');

  return createClient(url, key, {
    accessToken: async () => (await getToken()) ?? null,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

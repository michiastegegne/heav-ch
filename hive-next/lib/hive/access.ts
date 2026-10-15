import { auth } from '@clerk/nextjs/server';
import { createClerkSupabaseServerClient } from '@/lib/supabase/clerk-server';

export class HiveAccessError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireHiveDataAccess() {
  if (process.env.HIVE_CLERK_DB_BRIDGE_ENABLED !== 'true') {
    throw new HiveAccessError(503, 'Clerk database bridge is not enabled yet');
  }

  const { userId } = await auth();
  if (!userId) throw new HiveAccessError(401, 'Authentication required');

  return createClerkSupabaseServerClient();
}

export function jsonError(error: unknown) {
  if (error instanceof HiveAccessError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: 'Request failed' }, { status: 500 });
}

import { ZodError } from 'zod';
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
  if (error instanceof ZodError) {
    return Response.json(
      { error: 'Ungültige Eingabe', issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })) },
      { status: 400 },
    );
  }
  return Response.json({ error: 'Request failed' }, { status: 500 });
}

export function allowedWorkspaceIds() {
  return new Set(
    (process.env.HIVE_DEV_WORKSPACE_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export async function assertWorkspaceAllowed(
  workspaceId: string,
  supabase: Awaited<ReturnType<typeof createClerkSupabaseServerClient>>,
) {
  const configured = allowedWorkspaceIds();
  if (configured.has(workspaceId)) return;

  const { data, error } = await supabase.rpc('is_hive_preview_workspace', {
    p_workspace_id: workspaceId,
  });

  if (error || data !== true) {
    throw new HiveAccessError(403, 'Workspace is not available in this preview');
  }
}

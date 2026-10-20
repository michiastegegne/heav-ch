import { previewNoLogin } from '@/lib/hive/preview-mode';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getHiveAuthState } from '@/lib/hive/auth-provider';
import { createSessionSupabaseClient } from '@/lib/supabase/session-server';
import { ZodError } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { createClerkSupabaseServerClient } from '@/lib/supabase/clerk-server';

export class HiveAccessError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireHiveDataAccess() {
  if (previewNoLogin()) return createPreviewClient();
  const authState = getHiveAuthState();
  if (!authState.ready) {
    throw new HiveAccessError(503, 'Die Anmeldung ist noch nicht vollständig eingerichtet.');
  }

  if (authState.requested !== 'clerk') {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new HiveAccessError(503, 'Die Anmeldung ist noch nicht eingerichtet.');
    }
    const supabase = await createSessionSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new HiveAccessError(401, 'Bitte melde dich erneut an.');
    return supabase;
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
  if (!previewNoLogin() && configured.has(workspaceId)) return;

  const { data, error } = await supabase.rpc('is_hive_preview_workspace', {
    p_workspace_id: workspaceId,
  });

  if (error || data !== true) {
    throw new HiveAccessError(403, 'Workspace is not available in this preview');
  }
}

export async function getHiveAccessToken() {
  if (previewNoLogin()) {
    const client = await createPreviewClient();
    const { data: { session } } = await client.auth.getSession();
    return session?.access_token ?? null;
  }
  const authState = getHiveAuthState();
  if (!authState.ready) return null;
  if (authState.requested === 'clerk') {
    const { getToken } = await auth();
    return getToken();
  }
  const supabase = await requireHiveDataAccess();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/** No service role, no browser cookie: every query still runs under existing RLS.
 * Reject the identity entirely if ANY visible workspace is live, including inactive
 * memberships. Never reuse the visitor's session or an administrator identity.
 */
let previewSession: { key: string; until: number; client: SupabaseClient } | undefined;
let previewLogin: Promise<SupabaseClient> | undefined;

async function createPreviewClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.HIVE_PREVIEW_IDENTITY_EMAIL;
  const password = process.env.HIVE_PREVIEW_IDENTITY_PASSWORD;
  const expectedId = process.env.HIVE_PREVIEW_IDENTITY_ID;
  if (!url || !key || !email || !password || !expectedId) {
    throw new HiveAccessError(503, 'Preview identity is not configured');
  }
  const configKey = JSON.stringify([url, key, email, password, expectedId]);
  if (previewSession?.key !== configKey || previewSession.until < Date.now()) {
    // Coalesce concurrent page/API requests; the token stays in server memory.
    previewLogin ??= (async () => {
      const client = createClient(url, key, { auth: {
        persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
      } });
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || data.user?.id !== expectedId || !data.session) {
        throw new HiveAccessError(503, 'Preview identity is unavailable');
      }
      previewSession = { key: configKey, until: Math.min(Date.now() + 300_000,
        (data.session.expires_at ?? 0) * 1000 - 60_000), client };
      return client;
    })();
    try { await previewLogin; } finally { previewLogin = undefined; }
  }
  const client = previewSession!.client;
  const { data: workspaces, error: scopeError } = await client
    .from('workspaces').select('id, slug, status').limit(1000);
  if (scopeError || !workspaces?.length || workspaces.length >= 1000 || workspaces.some(workspace =>
    !workspace.slug?.startsWith('hive-dev-') || workspace.status !== 'active')) {
    throw new HiveAccessError(403, 'Preview identity must only access active hive-dev workspaces');
  }
  return client;
}

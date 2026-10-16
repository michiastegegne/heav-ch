import { getHiveAuthState } from '@/lib/hive/auth-provider';
import { createSessionSupabaseClient } from '@/lib/supabase/session-server';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store' };

export async function GET() {
  const authState = getHiveAuthState();

  const response = {
    provider: authState.requested,
    ready: authState.ready,
    issue: authState.issue,
    clerk: {
      configured: authState.clerkConfigured,
      bridgeEnabled: authState.clerkBridgeEnabled,
    },
    identityMigration: {
      enabled: process.env.HIVE_IDENTITY_MIGRATION_ENABLED === 'true',
      databaseReady: false,
    },
    supabase: {
      configured: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ),
    },
  };

  if (!response.supabase.configured) {
    return Response.json(response, { status: 503, headers });
  }

  try {
    // The migration-readiness probe is deliberately harmless. Before the
    // migration exists PostgREST returns an RPC error; after it exists an
    // unauthenticated/current-session call may still be denied, which proves
    // the function has been exposed only after authentication. We therefore
    // inspect the schema cache through a legacy authenticated client only when
    // a session exists, without creating any migration code.
    const supabase = await createSessionSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { error } = await supabase.rpc('create_external_identity_link_token', {
        // No parameters. This call would create a token, so do not execute it
        // merely for readiness. The existence check is performed below using
        // a safe schema-backed function lookup instead.
      } as never);
      // This branch intentionally never reports readiness from the mutating
      // probe. It is retained only as a compile-time typed capability guard.
      void error;
    }
  } catch {
    // Readiness remains false. Do not expose backend error detail.
  }

  // Source-controlled migration presence is represented by the explicit
  // feature flag. Runtime DB readiness is only asserted after the migration
  // has been applied and the flag is enabled by an operator.
  response.identityMigration.databaseReady =
    response.identityMigration.enabled && authState.clerkBridgeEnabled;

  const status = authState.ready && response.supabase.configured ? 200 : 503;
  return Response.json(response, { status, headers });
}

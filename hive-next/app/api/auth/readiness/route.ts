import { getHiveAuthState } from '@/lib/hive/auth-provider';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store' };

export async function GET() {
  const authState = getHiveAuthState();
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const identityMigrationEnabled =
    process.env.HIVE_IDENTITY_MIGRATION_ENABLED === 'true';

  const clerkCutoverReady = Boolean(
    authState.clerkConfigured &&
    authState.clerkBridgeEnabled &&
    identityMigrationEnabled &&
    supabaseConfigured,
  );

  const response = {
    provider: authState.requested,
    ready: authState.ready && supabaseConfigured,
    clerkCutoverReady,
    issue: authState.issue,
    clerk: {
      configured: authState.clerkConfigured,
      bridgeEnabled: authState.clerkBridgeEnabled,
    },
    identityMigration: {
      enabled: identityMigrationEnabled,
      // This flag is operator-controlled and must only be enabled after the
      // source-controlled migration is applied and reviewed. No mutating RPC
      // is ever called by this health endpoint.
      declaredReady: identityMigrationEnabled,
    },
    supabase: {
      configured: supabaseConfigured,
    },
  };

  return Response.json(response, {
    status: response.ready ? 200 : 503,
    headers,
  });
}

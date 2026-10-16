export type HiveAuthProvider = 'supabase' | 'clerk';
export type HiveAuthIssue =
  | 'invalid_provider'
  | 'clerk_keys_missing'
  | 'clerk_bridge_disabled'
  | 'clerk_identity_migration_disabled'
  | null;

type EnvLike = Record<string, string | undefined>;

export type HiveAuthState = {
  requested: HiveAuthProvider;
  ready: boolean;
  issue: HiveAuthIssue;
  clerkConfigured: boolean;
  clerkBridgeEnabled: boolean;
  identityMigrationEnabled: boolean;
};

export function getHiveAuthState(env: EnvLike = process.env): HiveAuthState {
  const raw = (env.HIVE_AUTH_PROVIDER || 'supabase').trim().toLowerCase();
  const requested: HiveAuthProvider = raw === 'clerk' ? 'clerk' : 'supabase';
  const invalidProvider = raw !== 'supabase' && raw !== 'clerk';
  const clerkConfigured = Boolean(
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    env.CLERK_SECRET_KEY,
  );
  const clerkBridgeEnabled = env.HIVE_CLERK_DB_BRIDGE_ENABLED === 'true';
  const identityMigrationEnabled = env.HIVE_IDENTITY_MIGRATION_ENABLED === 'true';

  if (invalidProvider) {
    return {
      requested,
      ready: false,
      issue: 'invalid_provider',
      clerkConfigured,
      clerkBridgeEnabled,
      identityMigrationEnabled,
    };
  }

  if (requested === 'clerk' && !clerkConfigured) {
    return {
      requested,
      ready: false,
      issue: 'clerk_keys_missing',
      clerkConfigured,
      clerkBridgeEnabled,
      identityMigrationEnabled,
    };
  }

  if (requested === 'clerk' && !clerkBridgeEnabled) {
    return {
      requested,
      ready: false,
      issue: 'clerk_bridge_disabled',
      clerkConfigured,
      clerkBridgeEnabled,
      identityMigrationEnabled,
    };
  }

  if (requested === 'clerk' && !identityMigrationEnabled) {
    return {
      requested,
      ready: false,
      issue: 'clerk_identity_migration_disabled',
      clerkConfigured,
      clerkBridgeEnabled,
      identityMigrationEnabled,
    };
  }

  return {
    requested,
    ready: true,
    issue: null,
    clerkConfigured,
    clerkBridgeEnabled,
    identityMigrationEnabled,
  };
}

export function usesClerk(env: EnvLike = process.env) {
  const state = getHiveAuthState(env);
  return state.requested === 'clerk' && state.ready;
}

export function clerkRequested(env: EnvLike = process.env) {
  return getHiveAuthState(env).requested === 'clerk';
}

export function authSetupMessage(issue: HiveAuthIssue) {
  if (issue === 'clerk_keys_missing') return 'Clerk ist ausgewählt, aber die Clerk-Schlüssel fehlen.';
  if (issue === 'clerk_bridge_disabled') return 'Clerk ist ausgewählt, aber die sichere Datenbank-Bridge ist noch nicht aktiviert.';
  if (issue === 'clerk_identity_migration_disabled') return 'Clerk ist ausgewählt, aber die sichere Identity-Migration ist noch nicht freigegeben.';
  if (issue === 'invalid_provider') return 'Der konfigurierte Auth-Provider ist ungültig.';
  return 'Die Anmeldung ist noch nicht vollständig eingerichtet.';
}

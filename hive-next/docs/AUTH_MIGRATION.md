# Hive authentication migration

## Decision

Hive uses Clerk for end-user authentication and keeps Supabase as the database.

Target sign-in methods:
- Apple
- Email one-time code
- Passkeys

## Current safety boundary

The production database still contains UUID owner/user references to `auth.users` and several RLS policies/functions call `auth.uid()`.

Clerk user IDs are strings, so they must **not** be cast to UUIDs or dropped into those policies.

Until the identity bridge and RLS migration are tested:
- do not enable Clerk-backed writes against production data;
- do not remove existing Supabase Auth users;
- do not change historical owner IDs;
- do not bypass RLS with a service-role key from the browser or normal app routes.

## Safe migration plan

1. Configure Clerk in Vercel and enable Apple, email code and passkeys in Clerk.
2. Enable Clerk as a Supabase Third-Party Auth provider.
3. Add an identity-link table mapping a Clerk user ID to the existing Supabase UUID user record.
4. Introduce a helper that resolves the current actor to the legacy UUID.
5. Migrate workspace/member policies and RPCs from direct `auth.uid()` checks to that helper.
6. Enable RLS on `customer_departments` together with tested workspace policies.
7. Test cross-workspace reads/writes with two identities.
8. Only then switch the new CRM from local prototype data to production Supabase data.

The legacy HEAV app can continue using Supabase Auth during the migration window.

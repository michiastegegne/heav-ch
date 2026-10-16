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

## Controlled cutover

Hive does not switch authentication just because Clerk keys exist.

The cutover requires all three conditions:
- `HIVE_AUTH_PROVIDER=clerk`
- valid Clerk publishable + secret keys
- `HIVE_CLERK_DB_BRIDGE_ENABLED=true`

If Clerk is explicitly selected but either the keys or the database bridge are missing, protected routes fail closed instead of silently falling back to Supabase Auth.

## New-user onboarding

Legacy users and genuinely new Clerk users are intentionally different flows.
Legacy users preserve their existing Hive UUID through a one-time migration
code. A new Clerk identity can explicitly start fresh, which provisions an
internal `app_users` UUID and first workspace atomically. No account is linked
or merged by email address.

## Safe migration plan

1. Configure Clerk in Vercel and enable Apple, email code and passkeys in Clerk.
2. Enable Clerk as a Supabase Third-Party Auth provider.
3. Add an identity-link table mapping a Clerk user ID to the existing Supabase UUID user record.
4. Introduce a helper that resolves the current actor to the legacy UUID.
5. Migrate workspace/member policies and RPCs from direct `auth.uid()` checks to that helper.
6. Enable RLS on `customer_departments` together with tested workspace policies.
7. Test cross-workspace reads/writes with two identities.
8. Verify at least two identities against cross-workspace negative tests.
9. Set `HIVE_CLERK_DB_BRIDGE_ENABLED=true`.
10. Set `HIVE_AUTH_PROVIDER=clerk` as the final reversible cutover step.

The legacy HEAV app can continue using Supabase Auth during the migration window.

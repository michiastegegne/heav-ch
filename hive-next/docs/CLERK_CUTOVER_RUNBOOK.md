# Hive Clerk cutover runbook

This runbook is intentionally conservative. The legacy Supabase Auth UUIDs stay
in place as Hive's internal identity anchors while Clerk becomes the user-facing
authentication provider.

## Safety invariants

- Never put a Clerk string user id into a UUID ownership column.
- Never expose a Supabase service-role key to browser or normal Hive routes.
- Never link accounts by email address alone.
- Never switch `HIVE_AUTH_PROVIDER` before RLS and identity mapping have been verified.
- Keep the legacy Supabase Auth users during the migration window.
- A rollback must not require a database rollback.

## Current normal state

```
HIVE_AUTH_PROVIDER=supabase
HIVE_CLERK_DB_BRIDGE_ENABLED=false
HIVE_IDENTITY_MIGRATION_ENABLED=false
```

Adding Clerk keys by itself must not change the active provider.

## Phase 1 — prepare Clerk

Configure the Clerk application and enable the intended sign-in methods:

- Apple
- email verification code
- passkeys

Add the Clerk publishable and secret keys to the preview environment. Leave
`HIVE_AUTH_PROVIDER=supabase`.

Configure Clerk as a Supabase Third-Party Auth provider. Do not use a browser
service-role client and do not introduce a custom JWT template unless the native
integration requires one in a future version.

## Phase 2 — apply identity-link migration

Apply and review:

`20261016_external_identity_link_tokens.sql`

Then explicitly insert the exact trusted Clerk issuer into
`trusted_external_auth_issuers`. Do not use a wildcard or a suffix match.

Only after the migration and issuer row are verified:

```
HIVE_IDENTITY_MIGRATION_ENABLED=true
```

Existing Supabase-authenticated users can now create a 15-minute one-time link
code from Account. The raw code is never stored in the database.

## Phase 3 — prepare mappings

For every existing Hive user that must keep historical data:

1. Sign in with the legacy Supabase account.
2. Generate a one-time migration code.
3. Sign in with the intended Clerk identity.
4. Redeem the code once.
5. Confirm `current_app_user_id()` resolves to the original legacy UUID.
6. Confirm workspace memberships and roles are unchanged.

Do not delete the legacy account after linking.

## Phase 3b — genuinely new Clerk users

A Clerk identity with no historical Hive data must not be linked by email and
must not silently create a second account.

The Account screen exposes two explicit paths:

- **Bestehende Daten** — redeem the one-time migration code and preserve the
  existing internal Hive UUID.
- **Neu starten** — atomically provision a new `app_users` identity and the
  first workspace through `provision_current_hive_account()`.

The new-account path is intentionally blocked for legacy Hive identities. It
uses the verified Clerk profile only as profile metadata; authorization still
comes exclusively from the trusted issuer + subject mapping.

## Phase 4 — negative security tests

Before cutover, verify with at least two independent identities:

- User A can read their own workspaces.
- User A cannot read User B's workspace by guessing the UUID.
- User A cannot create/update/delete rows in User B's workspace.
- Member cannot perform accountant-only invoice/offer actions.
- Accountant cannot perform owner-only team/lifecycle actions.
- An unlinked Clerk identity resolves to no internal user.
- An untrusted JWT issuer cannot redeem a migration code.
- A used or expired migration code cannot be redeemed again.
- A Clerk identity already linked to Account A cannot be moved to Account B.

## Phase 5 — enable database bridge

After the negative tests pass:

```
HIVE_IDENTITY_MIGRATION_ENABLED=true
HIVE_CLERK_DB_BRIDGE_ENABLED=true
```

Keep the active provider on Supabase and verify the readiness endpoint plus a
normal legacy login once more. Hive still stays on Supabase Auth until the final
provider switch; both readiness gates must already be true before Clerk can be
selected.

## Phase 6 — final preview cutover

The final switch is one variable:

```
HIVE_AUTH_PROVIDER=clerk
```

Redeploy the preview and verify:

- /login renders Clerk.
- Apple/email-code/passkey methods that are enabled in Clerk are offered.
- linked users enter /studio normally.
- unlinked users are sent to /account to link their existing Hive data.
- cross-workspace negative tests still pass.
- invoice, offer, file and team mutations still enforce the same roles.

## Rollback

If any authentication, RLS or data-access regression appears:

1. Set `HIVE_AUTH_PROVIDER=supabase`.
2. Redeploy.
3. Leave the identity bridge tables and mappings in place.
4. Do not delete Clerk identities or legacy Supabase users while investigating.

Because the database still resolves legacy UUID ownership, rollback does not
require rewriting business rows or reversing ownership foreign keys.

## Production cutover

Do not copy preview flags blindly to production. Production requires its own:

- Clerk production keys and Apple credentials;
- exact production Clerk issuer allowlist row;
- verified Supabase Third-Party Auth integration;
- identity mappings for required existing users;
- full cross-tenant negative test pass;
- backup / recovery point;
- explicit final provider switch.

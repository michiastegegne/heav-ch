# Isolated no-login preview

Set `HIVE_PREVIEW_NO_LOGIN=true` only on the intended Vercel preview branch.
Vercel production and development deployments cannot enable the bypass. Local
Next development also supports the flag; local production builds require an
explicit simulated Vercel preview environment for tests.

Provision a dedicated Supabase email/password account with memberships ONLY in
existing, neutralized, active `hive-dev-*` workspaces. Set server-only
`HIVE_PREVIEW_IDENTITY_ID`, `HIVE_PREVIEW_IDENTITY_EMAIL`, and
`HIVE_PREVIEW_IDENTITY_PASSWORD`. Never use the owner's existing account.
No service role is needed. The server authenticates that account with the public
Supabase key and all queries retain existing authenticated RLS. Credentials and
session tokens stay in server memory and are never put in visitor cookies.

Every data request checks all visible workspace rows and fails closed if any
workspace is live or inactive, if the lookup fails, or if the result reaches the
1000-row safety cap. Workspace checks additionally require the existing
`is_hive_preview_workspace` membership RPC; explicit workspace allowlists cannot
override it. Identity changes, onboarding and team invite claims are blocked.
`/login` and `/account` redirect to `/studio`. Read-only identity readiness uses
the same validated preview identity.

Outbound invoice/offer email is always disabled in this mode even if
`HIVE_ENABLE_EMAIL_SEND=true`. Portal invitations use the existing non-email
preview path. Keep `HIVE_ENABLE_EMAIL_SEND=false` in deployment settings too.
The shared preview is editable; do not add real contacts, financial details or
private files. Disable the flag to restore normal login. Remove this account's
memberships and revoke/delete its identity when retiring the preview.

Validation: `npm test`, `npm --prefix hive-next run build`, then
`npx playwright test --config playwright.hive.config.js` and
`npx playwright test --config playwright.hive-preview.config.js`.

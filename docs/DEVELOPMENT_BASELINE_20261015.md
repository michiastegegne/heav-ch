# Hive CRM — Development baseline (15 October 2026)

This document tracks the **development branch** only. Do not deploy this branch to production, apply database migrations, or change DNS without a separate review.

## Verified repository baseline

- Current application: static HTML/JavaScript frontend (GitHub Pages) with Supabase Auth, Postgres, RLS and Edge Functions.
- Admin UI: `admin/assets/app.js`; domain rules: `admin/assets/domain.js`.
- Workspace architecture: `docs/HIVE_WORKSPACES_PLAN.md` and `supabase/migrations/20261007_hive_workspaces.sql`.
- The current admin state includes `activeWorkspaceId`; customer and department write operations explicitly add `workspace_id`.
- Existing features documented by README: customers, departments, projects, offers, invoices, PDFs, portal, activity events and reminders.

## First release target: reliably separated businesses

**Do not rewrite the app before validating existing data and functionality.**

1. Record the deployed Supabase project and migrations **without exposing secrets**.
2. Export and verify a recoverable backup of business data, memberships, projects, offers and invoices.
3. Verify existing records all belong to **Michias Tegegne**; preserve stable IDs and historical invoice snapshots.
4. Confirm the current user can switch to **Wedding Vocals** and back without showing another business's customers, projects, offers, invoices or files.
5. Audit **every** database query and Edge Function for workspace scoping. Frontend filters alone are insufficient: test cross-workspace reads and writes directly against Supabase RLS.
6. Verify that references (customer, department, project) cannot point across workspaces, and invoice sequences, sender details and branding remain separate.
7. Test login, portal membership permissions, invoice PDF generation, reminder idempotency and authorization before enabling releases.

## Development safeguards

- Production (`main`) stays untouched until an explicitly reviewed PR.
- Database changes must be additive, reviewed migrations with a rollback and backup plan; no destructive resets or backfills against production on assumption.
- Never commit private keys, service-role keys, access tokens or real customer exports.
- Use a separate development Supabase project or isolated test data and a preview URL where feasible.
- Require `npm test`, `npm run check` and `npm run test:browser` to pass before any production merge.
- Never send real customer invoices, invites or reminders from a preview environment.

## Next implementation increments

1. **Workspace isolation tests** (queries, policies, relationships, documents) against a disposable test database.
2. **Switcher repair** based on reproducible failing cases; retain selected business only if the user still has membership.
3. **Business-specific branding and accounting** for Michias Tegegne and Wedding Vocals.
4. **Deployment modernization** only after parity and security checks; Vercel can be used without transferring the domain.
5. **ChatGPT MCP/API** with explicit permission boundaries and confirmation for financial actions.

## Acceptance criterion

An authenticated account managing Business A and B can create and access records inside each, but cannot access or mutate Business B's records while scoped to A; historical records remain intact. The behavior is verified by automated tests, not only screenshots.

# Hive CRM — Next.js rebuild

Hive is the new multi-business CRM / Creative Business OS being built in `hive-next/`.

The app is developed on the isolated branch `dev/hive-workspace-hardening-20261015`. Production workspaces are intentionally protected; preview-created businesses use `hive-dev-*` slugs.

## Implemented

- Clerk-authenticated Supabase access through the identity bridge.
- Workspace / business switching with per-business branding and settings.
- Safe preview business creation.
- Workspace roles: owner, admin, member and accountant.
- Customer CRUD plus customer departments.
- Project CRUD with customer + department scoping.
- Project workspaces with tasks, deliverables, files and activity.
- Product / service catalog with invoice and offer presets.
- Offer CRUD, lifecycle, portal sharing and accepted-offer to invoice conversion.
- Invoice drafts, final issue/numbering, immutable snapshots, PDF generation, status actions and guarded email sending.
- Per-business invoice numbering, CHF amounts, configurable VAT and payment settings.
- Customer portal memberships, invites, requests, reviews, files and publishing controls.
- Signed Supabase Storage uploads for portal files and business logos.
- Per-business email templates, logs and reminder settings.
- Resend-backed invoice / offer / reminder functions with workspace scoping.
- Global `Cmd/Ctrl + K` search across customers, projects, invoices and offers.
- Dev-copy isolation and negative tenant-access tests in the existing verification workflow.

## Email safety

Outbound mail is blocked unless this server-side variable is explicitly enabled:

```env
HIVE_ENABLE_EMAIL_SEND=true
```

The preview keeps it `false` by default. Resend credentials stay server-side / in Supabase Edge Function secrets.

## Local development

```sh
cd hive-next
npm install
npm run dev
```

Required variables are documented in `.env.example`.

## Authentication

When both Clerk keys are configured, Clerk and its explicit database bridge gate remain active. Without Clerk keys, Hive uses existing Supabase Auth accounts with password login and server-managed HttpOnly cookies. Signup and outbound authentication emails are not enabled by this fallback.

The server verifies every session with `getUser()` before database access. Workspace RLS and preview allowlisting apply to both providers. The root URL opens the actual CRM at `/studio`; it no longer opens the local-storage prototype.

Required for the existing Supabase login:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- existing Supabase account credentials

`HIVE_CLERK_DB_BRIDGE_ENABLED` only controls the Clerk bridge. Keep it false until Clerk integration is verified. Keep `HIVE_ENABLE_EMAIL_SEND=false` for previews.

## Deployment

Vercel project: `hive-crm-preview`

Root directory: `hive-next`

Git branch: `dev/hive-workspace-hardening-20261015`

The Vercel Hobby account can temporarily rate-limit preview deployments after many builds. GitHub CI remains the verification gate while that limit is active.

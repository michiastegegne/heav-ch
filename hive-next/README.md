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

## Current external dependency

The remaining login dependency is the Clerk project configuration and keys:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- enabled Clerk/Supabase third-party auth integration
- `HIVE_CLERK_DB_BRIDGE_ENABLED=true` after the integration has been verified

The database bridge and workspace-compatible RLS are already implemented. Do not expose Supabase service-role or Resend secret keys to browser code.

## Deployment

Vercel project: `hive-crm-preview`

Root directory: `hive-next`

Git branch: `dev/hive-workspace-hardening-20261015`

The Vercel Hobby account can temporarily rate-limit preview deployments after many builds. GitHub CI remains the verification gate while that limit is active.

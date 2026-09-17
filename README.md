# HEAV

Official multi-page website for [heav.ch](https://heav.ch), including the private HEAV Studio administration area.

## Public structure

- `/` — Home
- `/services/` — Film production services
- `/work/` — Selected work and visual studies
- `/about/` — About HEAV
- `/michias-tegegne/` — Founder and owner profile
- `/contact/` — Contact

## HEAV Studio

- `/login/` — passwordless owner sign-in by one-time email link
- `/admin/` — customers, projects, invoices and company settings
- `supabase/migrations/` — Postgres schema, constraints and owner-only RLS policies
- `supabase/functions/invoice-document/` — branded PDF generation and Resend delivery
- `supabase/functions/invoice-reminders/` — idempotent payment reminders before the due date

The public pages and admin client are static and deploy through GitHub Pages. Sensitive data and operations never live in GitHub Pages: Supabase provides Auth/Postgres/RLS and the Edge Function keeps the Resend key server-side.

### Invoice deletion and reminders

Owner deletion is explicit and atomic: deleting a customer removes its CRM, project, offer, invoice, portal-request, membership and activity records. Legacy archived invoices remain protected. Sent invoices can be deleted individually through the confirmation dialog; the delete action is never a silent cascade.

The setting `invoice_reminder_days` accepts 3, 7 or 10 days and defaults to 7. Migration `20260919_invoice_reminders.sql` claims each due reminder once and records the provider result idempotently. After deploying the migration and `invoice-reminders` function, configure `INVOICE_REMINDER_CRON_SECRET` as a server-side function secret and call the function once per day with that secret in `x-cron-secret`. The scheduler can be Supabase Cron, GitHub Actions or another private scheduler; it must not expose the secret in browser code. The reminder function does not run until this scheduler is configured.

### Departments and activity timeline

One legal customer can contain multiple departments. For example:

- Customer: Heilsarmee Schweiz
- Department: Berufsbildung — project: Lehrlingssuche
- Department: Jugend — project: Jugendprojekt

Projects, invoices, offers, files, reviews and portal memberships carry a `department_id`. Portal access is therefore scoped to the membership's department; the portal application remains shared. New customers receive an `Allgemein` department automatically. When a record is created through a project, the project's department is the default.

`activity_events` is the central owner timeline. It records relevant business events such as customer/department/project creation, invoice and offer creation, offer acceptance, invoice state events, portal membership changes and customer logins. It is not a debug log: metadata must stay structured and must never contain passwords, tokens, API keys or other secrets. Customer-facing visibility is controlled separately from the owner's audit view.

The migration is `supabase/migrations/20260918_departments_activity_log.sql`. Apply it only after reviewing the linked production database and test the Heilsarmee setup with one membership per department before inviting real contacts.

### Private access

HEAV Studio has no public preview, sample invoice or app-installation flow. Every `/admin/` URL, including URLs with arbitrary query parameters, requires a valid Supabase session. Invoice PDFs remain available only inside an authenticated Studio session.

### Local verification

```bash
npm install
npm test
npm run check
python3 -m http.server 4180 --bind 127.0.0.1
npm run test:browser
```

The browser suite replaces Supabase with an isolated test adapter. Production code contains no demo adapter or public fixture data.

### Production configuration

Production Auth and Function settings are versioned in `supabase/config.toml`; the local project link itself stays in the ignored `supabase/.temp/` directory. Browser code contains only the public project URL and publishable key; the service-role key must never enter this repository.

1. On a fresh checkout, link the target once with `npx --yes supabase@latest link --project-ref <project-ref>`.
2. Apply database changes with `npx --yes supabase@latest db push --linked`.
3. Push the Auth configuration with `npx --yes supabase@latest config push --project-ref <project-ref>`. Public and anonymous sign-up remain disabled; only existing users can request a magic link. Allowed redirects are limited to the HEAV login routes.
4. Deploy `invoice-document` with `npx --yes supabase@latest functions deploy invoice-document --project-ref <project-ref> --no-verify-jwt`. The function performs its own bearer-token validation with Supabase Auth before reading any invoice.
5. TOTP enrollment and verification are enabled in Auth. Enroll the owner account before using real business data.
6. For email delivery, configure the server-only Edge Function secrets `RESEND_API_KEY` and `RESEND_FROM_EMAIL`, then verify the `heav.ch` sender domain in Resend.
7. In HEAV Studio settings, complete the legal address, IBAN, VAT number/status, default tax and payment term before sending the first real invoice.

Customer and invoice data is personal/business data. Confirm the applicable Supabase/Resend data-processing terms and HEAV privacy notice before production use.

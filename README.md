# HEAV

Official multi-page website for [heav.ch](https://heav.ch), including the private HEAV Studio administration area.

## Public structure

- `/` — Home
- `/leistungen/` — Film production services
- `/arbeiten/` — Selected work and visual studies
- `/ueber-uns/` — About HEAV
- `/michias-tegegne/` — Founder and owner profile
- `/kontakt/` — Contact

## HEAV Studio

- `/login/` — passwordless owner sign-in by one-time email link
- `/admin/` — customers, projects, invoices and company settings
- `supabase/migrations/` — Postgres schema, constraints and owner-only RLS policies
- `supabase/functions/invoice-document/` — branded PDF generation and Resend delivery

The public pages and admin client are static and deploy through GitHub Pages. Sensitive data and operations never live in GitHub Pages: Supabase provides Auth/Postgres/RLS and the Edge Function keeps the Resend key server-side.

### Private access

HEAV Studio has no public preview, sample invoice or app-installation flow. Every `/admin/` URL, including URLs with arbitrary query parameters, requires a valid Supabase session. Invoice PDFs remain available only inside an authenticated Studio session.

### Local verification

```bash
npm install
npm test
npm run check
python3 -m http.server 4179 --bind 127.0.0.1
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

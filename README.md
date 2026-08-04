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

- `/login/` — confirmed email/password accounts with an 8-digit email code
- `/admin/` — customers, projects, invoices and company settings
- `supabase/migrations/` — Postgres schema, constraints and owner-only RLS policies
- `supabase/functions/invoice-document/` — branded PDF generation and Resend delivery

The public pages and admin client are static and deploy through GitHub Pages. Sensitive data and operations never live in GitHub Pages: Supabase provides Auth/Postgres/RLS and the Edge Function keeps the Resend key server-side.

### Installable app for Mac and mobile

HEAV Studio is a Progressive Web App. Open `/login/` and choose **HEAV App installieren**:

- macOS Safari: **File → Add to Dock**
- iPhone/iPad Safari: **Share → Add to Home Screen**
- Android Chrome: **Menu → Install app**
- Chromium desktop browsers show a native **Install now** action when available

The installed Studio launches in a standalone window and supports mobile safe areas. The fictional `/admin/?preview=1` design preview and sample invoice are cached for offline use. Real authentication and business data still require a network connection.

### Local verification

```bash
npm install
npm test
npm run check
python3 -m http.server 4179 --bind 127.0.0.1
npm run test:browser
```

The local browser suite uses `/admin/?demo=1`. The public `/admin/?preview=1` route is an explicit design preview with hardcoded fictional data; it never initializes Supabase and changes disappear on reload.

### Production configuration

Production Auth and Function settings are versioned in `supabase/config.toml`; the local project link itself stays in the ignored `supabase/.temp/` directory. Browser code contains only the public project URL and publishable key; the service-role key must never enter this repository.

1. On a fresh checkout, link the target once with `npx --yes supabase@latest link --project-ref <project-ref>`.
2. Apply database changes with `npx --yes supabase@latest db push --linked`.
3. Push the Auth configuration with `npx --yes supabase@latest config push --project-ref <project-ref> --yes`. Email/password registration is limited by a server-side before-user-created hook to confirmed `@heav.ch` mailboxes and requires an 8-digit confirmation code; anonymous sign-in remains disabled and allowed redirects are limited to the HEAV login routes. Custom code templates require a configured SMTP provider on Supabase hosted projects. Login and registration fields use the standard `username`, `current-password`, `new-password`, and `one-time-code` autocomplete values so Safari and Apple Passwords can save and fill the account.
4. Deploy `invoice-document` with `npx --yes supabase@latest functions deploy invoice-document --project-ref <project-ref> --no-verify-jwt`. The function performs its own bearer-token validation with Supabase Auth before reading any invoice.
5. TOTP enrollment and verification are enabled in Auth. Enroll the owner account before using real business data.
6. For email delivery, configure the server-only Edge Function secrets `RESEND_API_KEY` and `RESEND_FROM_EMAIL`, then verify the `heav.ch` sender domain in Resend.
7. In HEAV Studio settings, complete the legal address, IBAN, VAT number/status, default tax and payment term before sending the first real invoice.

Customer and invoice data is personal/business data. Confirm the applicable Supabase/Resend data-processing terms and HEAV privacy notice before production use.

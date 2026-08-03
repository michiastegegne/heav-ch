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

- `/login/` — password-protected sign-in
- `/admin/` — customers, projects, invoices and company settings
- `supabase/migrations/` — Postgres schema, constraints and owner-only RLS policies
- `supabase/functions/invoice-document/` — branded PDF generation and Resend delivery

The public pages and admin client are static and deploy through GitHub Pages. Sensitive data and operations never live in GitHub Pages: Supabase provides Auth/Postgres/RLS and the Edge Function keeps the Resend key server-side.

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

1. Create a Supabase project in the Swiss or nearest available EU region.
2. Run `supabase/migrations/20260803_heav_admin.sql`.
3. Create the single HEAV owner in Supabase Auth; public sign-up stays disabled.
4. Replace the two placeholders in `admin/config.js` with the project URL and public anon key. The anon key is safe for the browser because all tables are protected by RLS; never place the service-role key in this repository.
5. Configure Edge Function secrets: `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.
6. Deploy `invoice-document` and verify the `heav.ch` sender domain in Resend.
7. In HEAV Studio settings, complete the legal address, IBAN, VAT number/status, default tax and payment term before sending the first real invoice.

Customer and invoice data is personal/business data. Confirm the applicable Supabase/Resend data-processing terms and HEAV privacy notice before production use.

# Hive workspace design

The workspace is a practical editorial interface for a small creative business. Its hierarchy starts with attention and action: unpaid invoices, project dates and recent changes. Numbers are derived from records. Empty sections explain the next useful step.

## System

- White working canvas, quiet grey navigation, restrained black primary actions. No branded accent colour in app chrome. Business branding remains available for documents.
- DM Sans for interface text. 30px page headings, 15px section headings, 12px row titles; secondary detail stays visually subordinate. Financial amounts use tabular figures.
- 208px navigation rail with groups for workspace, finance, collaboration and administration. Compact header keeps business selection and global search available.
- Metrics sit in a ruled strip. Panels enclose related information, with 8px corners. Controls use 5–6px corners; small neutral badges indicate status.
- Desktop prioritises scan alignment. Mobile uses a safe-area-aware bottom navigation, full-width business selection, two-column metrics, touch-friendly record cards and full-screen document editors. List actions remain accessible.
- Search and status filters work on loaded workspace records. All status labels are German. Loading/error states must not present another business's records.

`workspace-design.css` owns these visual decisions. `studio.css` retains existing functional form, editor and print layout. `workspace-overview.tsx` owns the overview composition; its data comes from the existing authorised workspace API.

Verify the overview, customer lists, invoice filters, forms and workspace switching on desktop and mobile. Use test fixtures for regression screenshots; verify deployment against real authorised Dev data without changing production data.

## Appearance

The theme button in the workspace header, login and account pages switches between light and dark appearance. Dark is the default. The explicit choice is saved as `hive-appearance` in local storage; a small boot script restores it before the page content paints. Cross-tab storage changes are synchronised. Preferences remain local to the browser.

`app/theme.css` owns the dark surfaces, typography contrast, controls, overlays and form states. Print output stays light; generated PDFs are unchanged. Verify both themes at 390 and 1440 pixels, persistence through login/reload, form legibility and the account-page switch.

## Data protection and business identity

The primary workspace is resolved by stable slug (`michias-tegegne`, or its isolated `hive-dev-michias` preview copy). A still-authorized explicit choice takes precedence; no records are reassigned for presentation. Mobile chrome gives the business name priority. Disabled browser storage must not prevent loading or switching. Owner-only backup cards use the same spacing, touch targets, dark surfaces and status typography. See `docs/BACKUP_AND_RECOVERY.md` for encryption and recovery limits.

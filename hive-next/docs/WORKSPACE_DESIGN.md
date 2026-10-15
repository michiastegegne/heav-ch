# Hive workspace design

The workspace is a practical editorial interface for a small creative business. Its hierarchy starts with attention and action: unpaid invoices, project dates and recent changes. Numbers are derived from records. Empty sections explain the next useful step.

## System

- White working canvas, quiet grey navigation, restrained black primary actions. No branded accent colour in app chrome. Business branding remains available for documents.
- DM Sans for interface text. 30px page headings, 15px section headings, 12px row titles; secondary detail stays visually subordinate. Financial amounts use tabular figures.
- 208px navigation rail with groups for workspace, finance, collaboration and administration. Compact header keeps business selection and global search available.
- Metrics sit in a ruled strip. Panels enclose related information, with 8px corners. Controls use 5–6px corners; small neutral badges indicate status.
- Desktop prioritises scan alignment. Mobile uses horizontally scrollable module navigation, two-column metrics and stacked panels; list actions remain accessible.
- Search and status filters work on loaded workspace records. All status labels are German. Loading/error states must not present another business's records.

`workspace-design.css` owns these visual decisions. `studio.css` retains existing functional form, editor and print layout. `workspace-overview.tsx` owns the overview composition; its data comes from the existing authorised workspace API.

Verify the overview, customer lists, invoice filters, forms and workspace switching on desktop and mobile. Use test fixtures for regression screenshots; verify deployment against real authorised Dev data without changing production data.

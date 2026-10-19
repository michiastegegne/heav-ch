# Hive workspace: design and reliability

## Visual rules

The active surface system is `workspace-surface.css`, loaded after the structural shell. It replaces the previous Notion and Apple experiment styles rather than layering another experiment on top. Existing MIT shadcn primitives and OpenGlass controls are reused; no package, subscription, account or hosted design service has been added.

Warm off-white and plum form the light palette; dark mode uses deep plum surfaces. Peach, mint, lilac and blue distinguish the four metric groups. Semantic invoice/project status colours retain their separate meanings. Navigation and actions are capsules; cards use 20–28px radii; controls use 12px. Glass is reserved for the floating mobile navigation. Reduced motion disables entrances and interaction transitions; increased contrast removes blur.

The overview starts with a real active project and real status counts. There are no simulated performance graphs or progress percentages. Core data cards and tables remain opaque and readable.

## Reliability changes

- Optional email, portal and activity requests start alongside core CRM requests, but no longer gate rendering customers, projects, finance and business settings. Pending modules have a loading state; failures show a warning and retry. A failed module cannot render an empty editable form as if it had loaded successfully.
- Existing request-generation and workspace-identity guards also protect the secondary results. Business switching clears these states.
- GET requests have a 15-second timeout. Mutation requests deliberately have no new timeout because aborting a write does not prove that it was not persisted.
- Project view preference tolerates disabled local storage.
- `?view=` reflects the active module. Reload and browser history restore the visible module. Existing membership roles still decide which modules are permitted.

## Verification

Browser tests cover login, workspace isolation, customer CRUD, project views/status changes, invoice and offer drafts and retries, offline encrypted backup, theme persistence and responsive widths from 320px to 1440px. New regression scenarios reproduce email unavailability, delayed integrations, disabled storage, and module navigation across reload/back/forward.

These browser tests use the repository's isolated API fixture. The live deployment is separately checked for authenticated data loading and reading project details. No real customer records, issued invoices or external messages are modified as part of validation. Native physical iPhone rendering and real external email delivery are not asserted by these checks.

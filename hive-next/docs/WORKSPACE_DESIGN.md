# Hive workspace design

The current visual system is **Hive Glass**, introduced on 16 October 2026. Its research, tokens, layout rules, responsive behavior, accessibility decisions and iOS webapp behavior are documented in [APPLE_GLASS_DESIGN.md](APPLE_GLASS_DESIGN.md).

`app/studio/hive-design-system.css` owns the new appearance. `app/glass-shell.css` extends the same identity to login and account pages. Earlier module styles retain functional layouts for documents, project boards, calendars and detailed workspaces; their old monochrome appearance is superseded by the shared design system.

## Functional invariants

- All dashboard numbers and visualizations derive from authorized workspace records. No invented trends, financial amounts or activity.
- Existing role restrictions, workspace isolation, API wiring, preview mail restriction and encrypted backup behavior remain intact.
- The primary workspace resolves by stable slug (`michias-tegegne`, or its isolated `hive-dev-michias` copy). An explicit still-authorized business choice takes precedence. Visual labels never reassign records.
- Disabled browser storage does not block business switching. Delayed responses must not populate another business's visible state.
- Search and document actions remain accessible on desktop and mobile. Sheets own focus, Escape closes the top sheet and focus returns to the originating control.
- Existing appearance preferences stay in `hive-appearance`. The selected theme applies before content paint; changing the design does not reset the user's saved choice.
- iOS Home Screen installation runs the existing online application in standalone mode. No sensitive CRM data is cached offline. Physical-device installation remains a manual validation step.

Verify overview, lists, document editors, board/calendar, install instructions, both themes, common mobile widths and desktop. Use test fixtures for screenshots and read-only authenticated checks for the Dev preview. Production data is not mutated for design testing.

# Rounded Hive workspace

The workspace keeps the existing shadcn controls and OpenGlass UI dependency. This iteration removes the document icons and decorative title punctuation, uses a cool neutral canvas, and reserves translucent material for the floating mobile navigation. Content cards remain opaque for legibility.

## Surface rules

- Cards: 24px corners. Dialogs: 28px. Form controls: 14px. Action buttons and navigation capsules: fully rounded.
- Mobile dock: 36px corners, safe-area spacing, blurred and saturated backdrop, thin highlight and soft shadow. Selection uses a tinted inset capsule.
- Blue indicates navigation selection; existing semantic status colours remain unchanged.
- Page headings enter on navigation; dialogs enter on opening; controls respond to press. Reduced motion disables these transitions. Contrast and reduced-transparency preferences replace blur with an opaque surface.

## Appearance

Einstellungen → Erscheinungsbild offers Automatisch, Hell and Dunkel. The toolbar opens the same choices. The preference uses the existing `hive-appearance` local-storage key, preserving existing light/dark selections. Missing or automatic preference follows `prefers-color-scheme`, including live system changes. The early layout script resolves it before paint. Storage events and an in-tab event keep mounted controls and the OpenGlass appearance in sync.

The settings navigation separates appearance, brand, contact, billing, and data. Backup and business archive controls live under Daten; appearance applies immediately and has no business-save action.

This setting is per device, needs no backend changes, and introduces no service or subscription. It is a web glass treatment, not the native iOS material renderer.

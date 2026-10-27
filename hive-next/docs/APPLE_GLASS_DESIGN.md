# Hive Glass — design system and iOS webapp

16 October 2026. Research-informed web implementation, not a native SwiftUI application.

## Sources and template review

- Apple Materials: https://developer.apple.com/design/human-interface-guidelines/materials . Liquid Glass distinguishes navigation and controls from the content layer. Keep content surfaces quiet and do not stack glass on glass.
- Apple Layout: https://developer.apple.com/design/human-interface-guidelines/layout . Align related content, group by function, prioritize primary work, progressively disclose secondary modules and adapt to different viewports and safe areas.
- Apple Accessibility: https://developer.apple.com/design/human-interface-guidelines/accessibility . Preserve contrast, larger text, accessible names, keyboard navigation and reduced-motion behavior.
- Apple Design Resources: https://developer.apple.com/design/resources/ . Reference for native platform conventions; no SF Symbols artwork or proprietary Apple templates copied into the web app.
- WebKit Safari 26: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ . Home Screen web apps, standalone manifests, icons and progressive enhancement. This app includes PNG icons for older iOS versions as well as SVG for modern browsers.
- shadcn open-source blocks: https://ui.shadcn.com/blocks and sidebar structure: https://ui.shadcn.com/docs/components/base/sidebar . Evaluated for navigation grouping and dashboard composition. No starter application replaces the existing CRM or its backend.
- Liquid Glass React: https://github.com/rdev/liquid-glass-react (MIT). Evaluated; its README warns that Safari and Firefox partially support displacement effects. Not added as a dependency. Hive uses CSS backdrop blur, saturation, translucent surfaces, highlights and shadows, with opaque fallback. No claim of parity with Apple's native optical material.

## Layout rules

- 4/8 spacing scale: 8, 12, 16, 20, 24, 32, 48. Keep larger gaps between sections than between related elements.
- System font stack prefers Apple's installed system font. Strong headings, readable labels, tabular money; no external font download needed for the Studio.
- Primary accent: blue. Secondary violet/green identify project and customer contexts. Status is always written in text and never communicated by color alone.
- Desktop: grouped sidebar; content uses a maximum width and aligned panels. Overview: outstanding balance and actual paid share, compact work metrics, current projects, outstanding invoices, next action and activity.
- Mobile: top business selector, five primary navigation destinations, one create action, secondary modules in a sheet. Large controls, safe-area insets, full-screen document composer. Core actions target at least 44 CSS pixels; icon visuals may be smaller than their hit areas.
- Financial visualization uses paid value / (paid + outstanding value), all time across loaded records. No fabricated historical trend or monthly comparison. The hero button reads the amounts in text; decorative ring is hidden from assistive technology.
- Content uses solid standard surfaces. Glass only on top chrome, sidebar, floating tab bar, toast and temporary functional controls. Dialog content remains opaque and readable.
- 22–28px panel radii, capsule controls, 12–16px field/icon radii. Apply shape by purpose, not to every nested container.

## Interaction and states

Keep existing business scope, permissions, search, document editing, mail protections and backup behavior. Buttons retain semantic names. Sheets trap focus, Escape closes the top sheet, and focus returns to the trigger. Respect reduced motion and higher contrast; reduce transparency when requested or when blur is unavailable.

The iOS installation guide explains Safari → Share → Add to Home Screen and the Open as Web App option. Manifest is standalone with stable app id, start URL, 192/512px icons and 180px Apple touch icon. Standalone mode keeps safe areas. This is an online webapp: no private CRM records or authenticated responses are cached for offline use, and no background synchronization or native push is claimed.

## Verification

Run typecheck/build, existing workspace/browser tests and the added glass suite. Verify 320/375/390/430px, desktop, both themes, installation guide, actual downloaded icons, focus, contrast/reduced-motion media and business navigation. Test WebKit using `playwright.glass-webkit.config.js`. Desktop WebKit provides engine coverage, not a substitute for testing an installed webapp on a physical iPhone.

`hive-design-system.css` owns the new visual tokens and appearance. Existing module layouts preserve board, calendar, customer/project workspaces and document behavior. `glass-shell.css` applies the same identity to authentication and account pages.

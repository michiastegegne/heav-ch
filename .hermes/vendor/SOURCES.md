# Downloaded UI sources for the local HEAV finance preview

This directory contains source material downloaded for the local design preview only.
The production static Studio is not switched to React/Tailwind by this preview.

## Watermelon UI

- Repository: https://github.com/WatermelonCorp/watermellon-registry
- License: MIT (repository license)
- Used as the structural reference for:
  - `invoice-manager-dashboard` — finance shell, invoice register and navigation composition
  - `sidebar` — collapsible sidebar/mobile sheet interaction model
  - `data-table` — sorting, empty state and dense data-register behavior
  - `inline-toast` — feedback state after actions
  - `continuous-tabs` / `discrete-tabs` — filter tab treatment
  - `dropdown-menu` — sort menu treatment

## Bklit UI

- Repository: https://github.com/bklit/bklit-ui
- Registry: https://ui.bklit.com/r/{name}.json
- License: MIT for the chart components; Bklit Studio itself is not reused
- Downloaded registry blocks:
  - `stat-card-area-01`
  - `stat-card-line-01`
  - `stat-card-choropleth-01`
- Used as the data-visualisation reference for the finance analytics cards:
  - compact KPI header
  - trend badge
  - NumberFlow-style value hierarchy
  - area/line sparkline treatment

## Compatibility note

HEAV Studio is currently a static HTML/CSS/JavaScript application. The downloaded
Watermelon and Bklit components are React + Tailwind/shadcn registry items. The
preview uses a deliberately small static bridge only where React runtime wiring
is required; the source files and registry JSON remain available here for an
exact component-level migration if the Studio is moved to React later.

# Hive: Notion-nahe Dokumentansicht mit OpenGlass UI

## Tatsächlich übernommener Code

- `open-glass-ui@0.4.0`, MIT, fest im Lockfile. Installierte Komponenten:
  `Dock`, `SegmentedControl`, `GlassSystemProvider`. Keine Konten, Telemetrie-
  Integration oder externen Bilder für die Glasflächen eingerichtet.
  Quelle: https://github.com/moekoelueker/open-glass-ui
- Original shadcn Sidebar, Sheet, Separator, Skeleton, Tooltip und use-mobile
  aus der offiziellen new-york-v4 Registry, mit lokalen Importpfaden.
  Lizenz: `components/ui/LICENSE.md`.
- Zusammensetzung der Sidebar nach `sidebar-10`; Template-Demoseiten und
  Demo-Teams wurden durch echte Hive-Module und vorhandene Rollen ersetzt.
  Quellen: https://ui.shadcn.com/r/styles/new-york-v4/sidebar-10.json und
  https://ui.shadcn.com/r/styles/new-york-v4/sidebar.json

Die gesamte Notion-Anwendung wurde weder kopiert noch als Dienst eingebunden.
`notion-workspace.css` ist die Hive-Anpassung der Dokument-Hierarchie: warme
neutrale Flächen, kompakte Navigation, Seitenicon, klare Überschrift und
Kennzahlen mit Trennlinien statt einer Wand aus Karten.

## Material und Grenzen

OpenGlass besitzt die optische Gestaltung von Dock und Projektansichtswechsel.
Hive legt deren Position und Touch-Grössen fest. Die bisherige selbstgezeichnete
Dock-Materialdefinition wurde dafür entfernt. Die tatsächlichen Glas-Styles
kommen aus `open-glass-ui/styles.css` in der Komponentenebene.

Renderer: ausdrücklich `css`; kein WebGL-Canvas über Kundendaten. Die Bibliothek
liefert Kantenlicht, Frost und den animierten Auswahlindikator. CSS erzeugt keine
physikalisch genaue Lichtbrechung beliebiger Webseiteninhalte. Die Optik kann
zwischen Browsern variieren. Das ist eine installierbare Webapp, keine native
SwiftUI-Anwendung.

Alternative geprüft: https://github.com/rdev/liquid-glass-react (MIT). Deren
README weist darauf hin, dass Safari/Firefox die Displacement-Verzerrung nicht
anzeigen. Für die gewünschte iPhone-Webapp wurde daher zuerst OpenGlass im
CSS-Modus eingesetzt. https://github.com/jingerpie/ocean-dataview wurde als
Notion-Datenansicht geprüft; ein zusätzlicher Hono-/Drizzle-/Postgres-Stack
wurde für eine visuelle Variante nicht in das bestehende CRM eingeführt.

## Verhalten

- Appearance folgt Hives bereits gespeicherter Hell-/Dunkel-Einstellung.
- Mehr Kontrast / reduzierte Transparenz: opake Flächen ohne Hintergrundblur.
- Reduzierte Bewegung: Animationen deaktiviert.
- Projektansichten, Business-Switcher, Berechtigungen und APIs bleiben die
  vorhandenen Hive-Funktionen. Keine Notion-/Figma-/Design-Service-Laufzeit.
- Mobile Kennzahlen stehen in zwei Spalten; CHF bleibt getrennt vom Zahlenwert
  lesbar. Bestehende Finanzberechtigungen bleiben aktiv.

Der Plugin-Katalog wurde ebenfalls geprüft. Für den direkten, selbsthostbaren
Einbau wurde die lokale Bibliothek gewählt; es wurde kein neuer externer
Design-Dienst verbunden und kein Abonnement abgeschlossen.

# Hive: kostenlose, portable UI

Lokale shadcn/ui-Komponenten unter der MIT-Lizenz (`components/ui/LICENSE.md`).
Keine Template-Lizenz, kein UI-Abonnement und kein Baukastenkonto für den Betrieb.

## Verbindliche Quellen

- https://ui.shadcn.com/blocks — dashboard-01, Komposition der Kennzahlkarten
- https://ui.shadcn.com/r/styles/new-york-v4/card.json
- https://ui.shadcn.com/r/styles/new-york-v4/button.json
- https://ui.shadcn.com/r/styles/new-york-v4/table.json
- https://ui.shadcn.com/r/styles/new-york-v4/input.json
- https://ui.shadcn.com/r/styles/new-york-v4/badge.json
- https://ui.shadcn.com/r/styles/new-york-v4/dropdown-menu.json

Übernommen am 16.10.2026 aus der offiziellen Registry; Importpfade auf lokale
Utils und grosse Icon-Buttons auf 44px angepasst. Fachliche Inhalte und responsive Kundenkarten sind
Hive-spezifisch. Kein unveränderter Import des vollständigen Dashboards.

## Regeln

1. `app/ui.css`: zentrale Farbvariablen für hell/dunkel und Tailwind.
2. Neue Oberflächen verwenden die lokalen Komponenten statt eigener Buttons,
   Karten oder Formulare.
3. 4px-Spacing-Skala: 8/12/16/20/24/32/40; Karteninnenabstand 20–24px.
4. Mobile Aktionen mindestens 44px hoch. Tabellen erhalten mobile Karten.
5. Kundennamen öffnen die Akte; sekundäre Aktionen stehen im Tastatur- und
   Touch-bedienbaren Radix-Menü. Löschen behält die Bestätigung.
6. Glas für mobile Navigation und Projektansichtswechsel über OpenGlass UI;
   hoher Kontrast deaktiviert den Effekt.
7. Keine erfundenen Trends, Beispielkunden oder Dummy-Diagramme im echten CRM.
8. `system-shell.css` ersetzt die experimentellen Studio-Stile.
   `mobile-premium.css` und `hive-design-system.css` werden nicht mehr
   importiert. Bestehende Modulstile stehen in einer nachrangigen `legacy`-
   Ebene; neue Komponenten können sie ohne hohe Selektorgewichte ersetzen.

## Selbsthosting

Die Next.js-Webanwendung läuft mit `npm ci`, `npm run build`, `npm start` auf
einem Node-Server. Konfiguration: `.env.example`. Öffentliche
`NEXT_PUBLIC_*`-Werte müssen vor dem Build zur Zielumgebung passen.
HTTPS und ein Reverse Proxy gehören vor den Node-Prozess.

Dies hostet die Webanwendung. Das Backend verwendet Supabase (Datenbank,
Auth, Storage und Edge Functions). Vollständiges Selbsthosting benötigt
zusätzlich dessen Betrieb, Daten-/Dateiübertragung, Auth-Konfiguration und
einen getesteten Restore. Clerk ist optional; Standardprovider im Code:
Supabase. Diese UI-Änderung migriert weder Anmeldung noch Daten.

Ein Dockerfile für die Webanwendung liegt bei. Build-Kontext: `hive-next/`.
Nur die öffentlichen Supabase-Werte als Build-Argumente übergeben:

```sh
docker build -t hive-crm \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://your-backend.example \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key .
docker run --name hive-crm --restart unless-stopped \
  --env-file .env.production -p 127.0.0.1:3000:3000 hive-crm
```

Keine Service-Role- oder Mail-Schlüssel als Build-Argumente setzen. Die
`.dockerignore` hält Umgebungsdateien aus dem Image. Backend-URL und öffentlicher
Key gehören auch in die Laufzeitkonfiguration. Clerk ist in diesem Dockerfile
nicht als Build-Option vorgesehen; `HIVE_AUTH_PROVIDER=supabase` verwenden.
Dieser Container stellt weder Datenbank noch Storage bereit. Der Docker-Build
muss auf dem Zielserver noch geprüft werden; lokal ist Docker nicht verfügbar.

## Verfeinerung: Formen, Projektkarten und Statusfarben

- Aktionsbuttons sind pillenförmig; Karten behalten 12–14px Radien, Inputs
  ruhige 7–8px Radien. Keine Rundung sämtlicher Elemente auf denselben Radius.
- Statusfarben sind semantisch und in beiden Darstellungen abgestimmt:
  geplant gelb, in Arbeit/offen blau, pausiert violett, abgeschlossen/bezahlt/
  akzeptiert grün, überfällig/abgelaufen rot, Entwürfe und Stornos neutral.
  Die Beschriftung bleibt immer sichtbar; Farbe ist ein zusätzliches Signal.
- Boardkarten: Kunde, klickbarer Titel, Termin/Budget, Status und eine
  Bearbeiten-Aktion. Kein doppelter Workspace-Button. Verschieben und
  Statusauswahl nutzen weiterhin dieselbe gespeicherte Statusänderung.
- Das Projektformular ist auf Desktop zweispaltig und maximal 860px breit.
  Titel und Beschreibung nutzen die ganze Breite; unter 761px wird es
  einspaltig. Bestehende Escape-/Fokus-/Scroll-Sperren bleiben erhalten.

Die aktuelle Notion-/OpenGlass-Variante und deren Originalquellen sind in
[NOTION_AND_OPENGLASS.md](NOTION_AND_OPENGLASS.md) dokumentiert.

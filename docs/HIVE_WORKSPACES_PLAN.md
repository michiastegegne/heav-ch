# Hive Workspaces – Implementierungsplan

Stand: 7. Oktober 2026. Dieses Dokument beschreibt die Erweiterung der bestehenden HEAV-Studio-Codebasis zu Hive; es ersetzt keine bestehende Migration und löscht keine Daten.

## Architekturentscheidung

- **Produktname:** Hive.
- **Technisches Mandantenmodell:** `workspaces`. Der Begriff passt zur vorhandenen Studio- und Workspace-Oberfläche und verhindert eine Vermischung mit den Kunden-Abteilungen, die weiterhin interne Bereiche eines Kunden bleiben.
- **Fachliche Bezeichnung in der UI:** Business.
- **Zugriffsmodell:** `workspaces` → `workspace_memberships` → geschäftliche Daten. Die Membership-Rollen sind `owner`, `admin`, `member`, `accountant`.
- **Hive-Administration:** Die bestehende unveränderliche `studio_owners`-Grenze bleibt für das globale Control Center bestehen. Geschäftsdatensätze werden zusätzlich über Workspace-Membership und `workspace_id` begrenzt.

## Sicherer Migrationspfad

1. Eine Vorwärtsmigration legt Workspace-, Membership-, Branding-/Rechnungs- und Produktdaten an.
2. Für jeden bisherigen Studio-Owner wird ein Workspace erzeugt. Seine bestehenden `company_settings` werden in `workspace_settings` kopiert.
3. Bestehende CRM-Daten werden ohne Löschung dem erzeugten Workspace zugeordnet. Dadurch wird der bisherige Foto-/Video-Bestand zunächst als **Michias Tegegne** geführt.
4. Danach werden die zusätzlichen Workspaces **Wedding Vocals** und **Hive** mit getrennten Rechnungspräfixen und eigenen Settings erzeugt.
5. Alle Kernrelationen erhalten eine nicht-leere `workspace_id`; Fremdschlüssel, Trigger und Indizes verhindern Querverbindungen.
6. Rechnungsnummern werden pro Workspace und Jahr geführt. Bestehende Nummern bleiben unverändert; neue Nummern starten pro Workspace mit dessen Präfix.

## Datenmodell

- `workspaces`: Business-Stammdaten, slug, Eigentümer, Status.
- `workspace_memberships`: User-Zugriff und Rolle.
- `workspace_settings`: Kontakt-, Branding-, Rechnungs-, Zahlungs- und Steuerdaten, inklusive Logo-URL, Farben, Währung und Nummernpräfix.
- `products`: Workspace-eigene Standardleistungen.
- `workspace_id` für Kunden, Abteilungen, Projekte, Rechnungen, Positionen, Rechnungsereignisse, Offerten, Offer-Positionen/-Ereignisse, Nummernkreise, E-Mail-Vorlagen/-Logs und die bestehenden Portal-bezogenen Geschäftsdaten.

## UI

- Persistenter Business-Switcher in der Studio-Navigation.
- Aktiver Workspace wird pro Benutzer in `localStorage` gespeichert und bei jedem Laden gegen die erlaubten Memberships validiert.
- Jede Studio-Abfrage erhält eine explizite `.eq("workspace_id", activeWorkspace.id)`-Einschränkung.
- `Einstellungen → Business & Branding` bearbeitet nur `workspace_settings`.
- Rechnung/Offerte übernehmen Workspace-Branding, Absender, Zahlungsdaten, Nummernpräfix und Währung dynamisch.
- Standardleistungen werden im Rechnungs- und Offerten-Editor schnell auswählbar.
- Die globale Ansicht `Hive → Businesses` zeigt vorbereitete Kennzahlen pro Workspace.

## Bestehende Funktionalität

- Kunden-Abteilungen bleiben erhalten und sind ausdrücklich **nicht** dasselbe wie Workspaces.
- Historische Rechnungen und ihre Snapshots bleiben unverändert und unveränderlich.
- Kundenportal, E-Mail- und Invoice-Edge-Functions erhalten den Workspace-Kontext über die verknüpften Datensätze; sie dürfen keine globalen Settings mehr voraussetzen.
- Die vorhandene Owner-Sicherheitsgrenze bleibt bestehen, während die Workspace-Membership für spätere Rollen vorbereitet wird.

## Abnahme

Automatisiert werden mindestens getestet:

1. sichere Backfill-Zuordnung der bestehenden Daten;
2. zwei Workspaces mit getrennten Kunden und Projekten;
3. pro Workspace getrennte Rechnungszähler und Präfixe;
4. Workspace-übergreifende Fremdbeziehungen werden abgewiesen;
5. Produkte sind nur im zugehörigen Workspace sichtbar;
6. Business-Switcher schränkt die Browser-Abfragen ein;
7. Rechnungs-PDF liest Branding und Absender aus dem Snapshot des jeweiligen Workspace.

# HEAV Studio – Completion Plan

> Diese Checkliste beschreibt die noch zwingend notwendigen Arbeiten vor einer produktiven Freigabe. Sie ist eine Arbeitsgrundlage, keine bereits ausgeführte Änderung.

**Ziel:** Das HEAV-Projekt soll lokal reproduzierbar, produktionssicher, vollständig deploybar und live verifiziert sein – ohne stille Datenfehler, doppelte E-Mails oder unvollständige Kundenansichten.

**Aktueller Stand:** `main` ist synchron mit `origin/main`; die Arbeitsänderungen sind noch nicht committed. Verifiziert sind 73 Node-Tests, 91 Playwright-Tests und 26 Deno-Tests. Die lokale Arbeitsumgebung ist vollständig ausgecheckt. Produktions- und Live-Abnahmen bleiben offen.

**Definition of Done:**

- [ ] Keine P0- oder P1-Lücke ist offen.
- [ ] Jeder produktive Supabase-Stand ist aus dem Repository reproduzierbar.
- [ ] Alle öffentlichen Assets laden aus einem vollständigen Checkout ohne 404.
- [x] AI-Vorschläge bewahren unbekannte Werte und lösen keine stillen Nullwerte aus.
- [x] Offertenversand ist retry-sicher und auditierbar.
- [x] Kunden mit mehreren aktiven Memberships sehen alle freigegebenen Konten korrekt.
- [x] Ein erneuter Studio-Aufruf zeigt den gespeicherten AI-Verlauf wieder an.
- [ ] Lokale und echte Browser-QA ist auf Desktop und Mobile bestanden.
- [ ] Supabase-Migrationen, Edge Functions, Auth-Konfiguration und Secrets sind live geprüft.
- [ ] Es gibt einen reproduzierbaren Release- und Verifikationsablauf.

---

## Priorität P0 – Arbeitsumgebung und vollständige Artefakte herstellen

### 1. Sparse-Checkout vor jeder weiteren QA korrigieren

Der ursprüngliche lokale Checkout hatte 67 `skip-worktree`-Markierungen und fehlende Deploy-Dateien. Dieser Zustand ist korrigiert; die folgenden Punkte dokumentieren die bereits erledigte Bereinigung.

- [x] Für Entwicklung und Deployment auf einen vollständigen Checkout umgestellt (`git sparse-checkout disable`).
- [x] Mit `git ls-files -v` geprüft, dass keine Datei mehr als `skip-worktree` markiert ist.
- [x] `portal-access-request/index.ts`, `deno.json` und `deno.lock` sind lokal vorhanden.
- [x] Vollständigen Asset-Smoke-Test unter `tests/browser/public-assets.spec.js` ergänzt.
- [x] Öffentliche Routen bei 390 px und 1440 px geladen und ohne festgestellte lokale 404-Ressourcen verifiziert.
- [ ] Erst danach Screenshots, visuelle QA und Supabase-Deployments beurteilen.

**Betroffene Dateien:**

- `.git/info/sparse-checkout` beziehungsweise lokale Checkout-Konfiguration
- `tests/browser/` für den neuen Asset-Smoke-Test
- öffentliche `*/index.html`-Dateien nur, falls dabei tatsächlich defekte Referenzen gefunden werden

**Akzeptanz:** `/`, `/services/`, `/work/`, `/about/`, `/michias-tegegne/`, `/contact/`, `/legal-notice/` und `/privacy/` laden ohne lokale 404-Ressourcen und ohne JavaScript-Fehler.

---

## Priorität P1 – AI-Assistent vor produktiver Aktivierung korrigieren

### 2. Fehlende Rechnungswerte nicht in Nullwerte umwandeln

In `admin/assets/app.js:836-840` werden fehlende oder ungültige Rechnungswerte derzeit sinngemäss zu `quantity = 1` und `unit_price_rappen = 0`. Dadurch kann ein unvollständiger AI-Vorschlag als CHF-0.00-Position im Editor erscheinen.

- [x] Failing Browser-Test für eine Position ohne `unit_price_rappen` ergänzt.
- [x] Normalizer verwirft unvollständige Rechnungsentwürfe statt CHF 0.00 einzusetzen.
- [x] Negative, nicht numerische und unsichere numerische Werte werden im Backend verworfen.
- [x] Verhalten festgelegt: Ein unvollständiger Rechnungsentwurf wird verworfen; kein automatischer Default auf CHF 0.00.
- [ ] Das Verhalten von `tax_rate`, `budget_rappen`, `quantity` und `unit_price_rappen` zwischen:
  - [ ] `supabase/functions/assistant-chat/index.ts`
  - [ ] `admin/assets/app.js`
  - [ ] `admin/assets/domain.js`
  - [ ] den Datenbank-Validatoren
  angleichen.
- [x] Deno-Test für fehlende und ungültige numerische Rechnungsfelder ergänzt.
- [x] Browser-Tests für unbekannte MWST und fehlende Positionspreise getrennt gehalten.

**Akzeptanz:** Unbekannte Preise bleiben unbekannt. Der Assistent fordert eine Ergänzung oder verwirft den Vorschlag. Kein CRM-Datensatz wird mit einem ungewollten Nullpreis erzeugt.

### 3. Gespeicherten AI-Chat nach Reload wiederherstellen

`admin/assets/app.js:918-923` stellt aktuell nur die Thread-ID aus `localStorage` wieder her. Der Verlauf aus `assistant_messages` wird nicht geladen und nicht dargestellt.

- [x] Owner-geschützte Adapter-Leseoperation für den Threadverlauf ergänzt.
- [x] Nur den aktuell gespeicherten, ownergebundenen Thread laden.
- [x] Nachrichten chronologisch rendern und gespeicherte Vorschläge erneut normalisieren.
- [x] Gelöschte oder fremde Thread-IDs lokal bereinigen.
- [ ] Während des Ladens einen separaten Ladezustand anzeigen, ohne den Chat als leer zu signalisieren.
- [x] Chatdaten bleiben im owner-namespace-lokalem Storage-Key.
- [x] Browser-Test für Reload, Verlauf und Vorschlag ergänzt.
- [x] Browser-Test für gelöschten Thread und accountübergreifenden Local-Storage-Wechsel behalten.

**Betroffene Dateien:**

- `admin/assets/app.js`
- `tests/browser/admin.spec.js`
- gegebenenfalls `supabase/migrations/20260916_studio_owner_authority_and_assistant.sql`, nur wenn die bestehende RLS-Struktur die ownergebundene Leselogik nicht bereits ausreichend abdeckt

**Akzeptanz:** Ein Studio-Reload verliert die sichtbare Gesprächshistorie nicht. Ein anderer Owner kann keinen Verlauf lesen.

### 4. AI-Feature erst nach vollständiger Produktionsfreigabe aktivieren

- [ ] Prüfen, ob `data-assistant-enabled="false"` in `studio/index.html` bis zum Abschluss der AI-Abnahme bewusst deaktiviert bleibt.
- [ ] Produktions-Enable-Flag nicht nur clientseitig, sondern für die gewünschte Umgebung nachvollziehbar konfigurieren.
- [ ] `OPENAI_API_KEY` serverseitig nur per Secret-Namen prüfen; niemals auslesen, drucken oder committen.
- [ ] Separat prüfen, ob das verwendete OpenAI-Projekt aktive API-Credits besitzt. Ein vorhandener Key allein reicht nicht.
- [ ] Tatsächliches Modell (`OPENAI_MODEL`) und Tokenlimit dokumentieren.
- [ ] Retention-Angaben in `privacy/index.html` mit der realen Provider-Konfiguration abgleichen.
- [ ] Providerfehler, Rate-Limit, Timeout, ungültige Modellantwort und Bildvalidierungsfehler live testen.
- [ ] Screenshot-Datenfluss prüfen: keine Speicherung in Supabase Storage, keinem Log und keinem persistenten Browser-State.

---

## Priorität P1 – Offertenversand retry-sicher machen

### 5. Idempotenz für `offer-send` einführen

`supabase/functions/offer-send/index.ts:67-75` erzeugt pro Versuch einen neuen zufälligen Idempotency-Key. Wenn die E-Mail erfolgreich zugestellt wurde, aber der Audit-Insert fehlschlägt, kann ein Retry dieselbe Offerte erneut versenden.

- [x] Stabilen Request-Key und serverseitige Versandreservierung eingeführt.
- [x] Durable Struktur und RPCs in `20260917_offer_send_reliability.sql` ergänzt.
- [ ] Statusübergänge festlegen: `draft` → `sent` → Versandversuch → `emailed` beziehungsweise kontrollierter Fehlerzustand.
- [x] Gleiche Offerte und gleicher Request-Key verwenden denselben Versandversuch und Provider-Key wieder.
- [x] Nach Provider-Versand und Audit-/HTTP-Fehler kann ein Retry keine zweite Provider-Mail erzeugen.
- [ ] Fehler nach Provider-Annahme als unklare beziehungsweise zu klärende Zustellung behandeln, nicht als sicheren Nichtversand.
- [ ] `offer_events` weiter mit `kind = 'emailed'` auditieren und sensible Providerantworten begrenzen.
- [x] `admin/assets/app.js` erzeugt und behält den Request-Key bis zum erfolgreichen Abschluss.
- [ ] Kein neuer Versandbutton darf während eines laufenden Versuchs mehrfach auslösbar sein.
- [x] PGlite-Vertragstest für Providerfehler, denselben Request-Key, Retry und genau ein Audit-Event ergänzt.
- [ ] Direkte Edge-Function-Tests mit gemocktem Provider für alle fünf Provider-/Statusfälle ergänzen.
- [ ] Browser-Test für einen echten Netzwerkfehler und denselben Versandauftrag ergänzen.

**Betroffene Dateien:**

- `supabase/functions/offer-send/index.ts`
- neue Tests unter `supabase/functions/offer-send/index_test.ts` oder entsprechendem bestehenden Testmuster
- neue Migration unter `supabase/migrations/` nur falls eine Datenbankänderung erforderlich ist
- `admin/assets/app.js`
- `tests/browser/admin.spec.js`
- `tests/production-config.test.js`

**Akzeptanz:** Ein verlorener HTTP-Response, ein Audit-Fehler oder ein Benutzer-Retry kann keine unbeabsichtigte doppelte Offertenmail erzeugen.

---

## Priorität P1 – Kundenportal mit mehreren Memberships korrekt machen

### 6. Multi-Membership-Verhalten entscheiden und implementieren

`portal/assets/portal.js:141-150` verwendet nur `memberships[0].customer_id`, obwohl das UI mehrere Memberships bereits berücksichtigt (`portal/assets/portal.js:160-161`).

- [x] Mehrere aktive Kundenkonten sind erlaubt; der bestehende Datenbankentwurf (`unique(customer_id, user_id)`) unterstützt sie.
- [x] Sichtbares Kundenkonto-Auswahlfeld ergänzt.
- [x] Projekte, Rechnungen, Dateien, Offerten und „Nächster Schritt“ werden für das ausgewählte Konto geladen.
- [x] Kontowechsel lädt die Daten vollständig neu und aktualisiert den Bewertungs-Kontext.
- [ ] `offer`-Deep-Links gegen alle erlaubten Memberships auflösen, nicht nur gegen das erste Konto.
- [ ] Auswahl nach Reload sicher und ohne fremde IDs wiederherstellen.
- [ ] Falls nur ein Konto erlaubt sein soll:
  - [ ] die Datenbank mit einer eindeutigen Regel absichern
  - [ ] die Mehrfachauswahl aus dem UI entfernen
  - [ ] die Entscheidung in README und Portal-Tests dokumentieren
- [ ] RLS unverändert als Sicherheitsgrenze beibehalten; die UI-Auswahl darf nie die alleinige Autorisierung sein.
- [x] Browser-Tests für ein und mehrere Konten ergänzt; jedes Fixture-Konto sieht ausschliesslich die eigenen Daten.

**Betroffene Dateien:**

- `portal/assets/portal.js`
- `client/index.html`
- `portal/assets/*.css` beziehungsweise die tatsächlich verwendete Client-CSS
- `tests/browser/client-workspace.spec.js`
- `tests/customer-portal-ui.test.js`
- gegebenenfalls neue Migration unter `supabase/migrations/`

**Akzeptanz:** Mehrere aktive Memberships führen weder zu einer unvollständigen Ansicht noch zu einer unautorisierten Datenansicht.

---

## Priorität P1 – Produktionsdatenbank und Edge Functions live abgleichen

### 7. Supabase-Migrationen sicher ausrollen

Vor dem Push muss die Owner-Migration gegen die tatsächliche Produktionsdatenbank geprüft werden. Die Migration setzt eine exakt passende, unabhängig verifizierte Auth-Identität voraus.

- [ ] Vorab den tatsächlichen Auth-User für `admin@heav.ch` prüfen.
- [ ] Prüfen, dass genau eine vertrauenswürdige Owner-Identität existiert.
- [ ] Prüfen, dass kein bereits angelegter, gefälschter `company_settings`- oder Business-Datensatz als Owner verwendet würde.
- [ ] Preflight-Abfrage und Ergebnis dokumentieren, ohne personenbezogene Daten oder Tokens zu committen.
- [ ] Testen, dass ein gefälschter, vor der Migration angelegter Business-Datensatz keinen Ownerzugriff erhält.
- [ ] `20260916_studio_owner_authority_and_assistant.sql` zuerst in einer isolierten Umgebung ausführen.
- [ ] Die explizite `BEGIN`/`COMMIT`-Grenze und das `LOCK TABLE`-Verhalten mit dem echten Supabase-Migrationsrunner prüfen.
- [ ] Migration mit dem verlinkten Projekt ausführen:
  - [ ] `npx --yes supabase@latest db push --linked`
- [ ] Nach dem Push prüfen:
  - [ ] `is_studio_owner()` hat null Argumente.
  - [ ] nur die beabsichtigte Identität ist in `studio_owners`.
  - [ ] alle owner-exponierten `SECURITY DEFINER`-RPCs prüfen die Ownerautorität.
  - [ ] kundenorientierte Acceptance-/Membership-Funktionen bleiben getrennt und funktionsfähig.
  - [ ] RLS auf allen relevanten Tabellen aktiv ist.

### 8. Auth- und Function-Konfiguration ausrollen

- [ ] Produktionskonfiguration pushen:
  - [ ] `npx --yes supabase@latest config push --project-ref <project-ref>`
- [ ] Prüfen, dass öffentliche Signup-Erstellung deaktiviert bleibt.
- [ ] Bestehende Owner-Magic-Links funktionieren weiterhin.
- [ ] TOTP für den Owner aktiviert und enrolment/verification erfolgreich getestet.
- [ ] Nur die vorgesehenen Login-Redirects sind erlaubt.
- [ ] Alle Functions aus einem vollständigen Checkout deployen:
  - [ ] `contact-enquiry` mit deaktivierter Gateway-JWT-Prüfung
  - [ ] `portal-access-request` mit deaktivierter Gateway-JWT-Prüfung
  - [ ] `invoice-document` mit deaktivierter Gateway-JWT-Prüfung und eigener Tokenprüfung
  - [ ] `assistant-chat` mit aktivierter Gateway-JWT-Prüfung
  - [ ] `portal-send-invite` mit aktivierter Gateway-JWT-Prüfung
  - [ ] `offer-send` mit aktivierter Gateway-JWT-Prüfung
- [ ] Für `invoice-document` die dokumentierte Option `--no-verify-jwt` verwenden.
- [ ] Für Functions mit `verify_jwt = true` den Gateway-Status nach dem Deploy prüfen.
- [ ] Edge-Function-Versionen und tatsächlich deployte Pfade dokumentieren.
- [ ] Keine Service-Role-Keys, Resend-Keys oder OpenAI-Keys in Terminalausgaben, Logs oder Commits preisgeben.

### 9. Produktions-Secrets und externe Dienste verifizieren

Nur Secret-Namen und Konfigurationszustände prüfen, niemals Secret-Werte ausgeben.

- [ ] `RESEND_API_KEY` vorhanden und gültig.
- [ ] `RESEND_FROM_EMAIL` vorhanden und auf der verifizierten `heav.ch`-Domain nutzbar.
- [ ] `CONTACT_FROM_EMAIL` sofern verwendet korrekt konfiguriert.
- [ ] `OPENAI_API_KEY` vorhanden.
- [ ] OpenAI-Projekt besitzt aktive API-Credits.
- [ ] Supabase Auth-Mailversand ist für Magic Links und Portal-Einladungen konfiguriert.
- [ ] Sender, Reply-To und Redirect-URLs mit realen HEAV-Adressen prüfen.
- [ ] Das Produktionskonto besitzt vollständige Rechnungsdaten: Adresse, IBAN, MWST-Status, Standardsteuer und Zahlungsfrist.

---

## Priorität P1 – Reale End-to-End-Abnahme

### 10. Owner- und Kundenflüsse mit echten Auth-Sessions testen

Testidentitäten trennen: Owner-Adresse nicht für Kundenportal-Tests verwenden.

- [ ] Owner anmelden und Owner-Routing über `/login/` nach `/studio/` prüfen.
- [ ] Owner mit zusätzlicher Kunden-Membership testen: Owner bleibt im Studio.
- [ ] Authentifizierter Benutzer ohne Rolle testen: Logout und sichtbarer Login ohne Redirect-Schleife.
- [ ] Owner-Kunde-Projekt-Rechnung anlegen.
- [ ] Rechnung als PDF generieren und herunterladen.
- [ ] Swiss-QR-Payload mit realer gültiger Schweizer IBAN prüfen.
- [ ] Rechnung senden und tatsächlichen E-Mail-Empfang prüfen.
- [ ] `invoice_events` und Statusänderung nach Versand prüfen.
- [ ] Rechnung als bezahlt markieren und Audit-Eintrag prüfen.
- [ ] Stornierung inklusive Bestätigung und gesperrter Folgeaktionen prüfen.
- [ ] Separate Kundenidentität für Portalzugang verwenden.
- [ ] Portal-Anfrage senden, im Studio akzeptieren und Einladung versenden.
- [ ] Kundenkonto über den echten Login-Link öffnen.
- [ ] Projekte, freigegebene Rechnungen, Dateien und Offerten prüfen.
- [ ] Offerte per E-Mail senden, Deep-Link öffnen und einmalig annehmen.
- [ ] Zweite Annahme, abgelaufene Offerte und revoked Membership ablehnen lassen.
- [ ] PDF-Vorschau bleibt innerhalb des Kundenportals und öffnet keinen neuen Tab.
- [ ] Datei-Download funktioniert nur für freigegebene, nicht abgelaufene Dateien.
- [ ] Bewertungsformular akzeptiert nur das eingeloggte Kundenkonto.

### 11. Visuelle und responsive Live-QA

- [ ] Studio auf 360 px, 390 px, 768 px und 1440 px rendern.
- [ ] Login auf denselben Breiten rendern.
- [ ] Kundenportal auf denselben Breiten rendern.
- [ ] Öffentliche Website auf 390 px und 1440 px rendern.
- [ ] Keine horizontale Dokumentüberbreite.
- [ ] Mobile Navigation öffnen, schliessen, während des Schliessens wieder öffnen und über Breakpoints wechseln.
- [ ] Scrollposition beim Öffnen/Schliessen exakt prüfen.
- [ ] Tastaturfokus, Escape, Tab und Shift+Tab in allen Dialogen und Menüs prüfen.
- [ ] Reduced-Motion-Modus prüfen.
- [ ] Kontrast von Text, Formularrändern, Statusfarben und destruktiven Aktionen prüfen.
- [ ] Rechnungsaktionen auf Desktop und Touch prüfen.
- [ ] Offerten- und Portal-Aktionen auf Touch prüfen.
- [ ] Bilder, Fonts, Favicon, Service Worker und alle lokalen Assets auf HTTP 200 prüfen.
- [ ] Browser-Console und Network-Logs auf 404, CORS-Fehler, unhandled rejections und Runtime-Fehler prüfen.

---

## Priorität P1 – Release-Schutz und reproduzierbare Verifikation

### 12. CI für jede Änderung einführen

Im Repository gab es zu Beginn keine CI-/Release-Konfiguration. Die Verifikation ist nun als Workflow vorhanden; Deployment und Live-Abnahme bleiben bewusst nachgelagert.

- [x] `.github/workflows/verify.yml` angelegt.
- [x] Workflow läuft bei Push und Pull Request gegen `main`.
- [x] `npm ci` wird verwendet.
- [x] `npm test` und `npm run check` werden ausgeführt.
- [x] Playwright Chromium wird installiert und `npm run test:browser -- --workers=1` ausgeführt.
- [x] Deno 2.9.4 ist festgelegt; `deno check` und Edge-Function-Tests laufen mit den erforderlichen Permissions.
- [x] CI verwendet den vollständigen Checkout und gibt keine produktiven Secrets aus.
- [ ] Deployment erst nach erfolgreicher Verifikation erlauben.
- [ ] Falls GitHub Pages ausserhalb dieses Repositories konfiguriert ist, den tatsächlichen Pages-Build separat dokumentieren und testen.

### 13. Release- und Cache-Disziplin festlegen

- [ ] Bei jeder Änderung an generiertem Studio-Markup `studio/index.html` und die referenzierte `app.js`-Version gemeinsam aktualisieren.
- [ ] Bei jeder CSS-Änderung den versionierten Stylesheet-Query aktualisieren.
- [ ] Bei Änderungen an Edge Functions die deployte Function-Version beziehungsweise den Release-Commit dokumentieren.
- [ ] Vor dem Release lokale 200-Checks für alle versionierten Assets ausführen.
- [ ] Nach dem Release cache-bustete Live-HTML-, CSS- und JS-Dateien abrufen und mit dem Release vergleichen.
- [ ] Gelöschte Assets müssen live 404 liefern; erwartete Assets müssen live 200 liefern.
- [ ] Logged-out-Routing separat testen, weil private Studio- und Portal-Routen keine öffentliche Preview darstellen dürfen.
- [ ] Keine Demo-Daten, Beispielrechnungen oder Testadapter in den Produktionsbuild aufnehmen.

---

## Priorität P2 – Dokumentation und Wartbarkeit abschliessen

### 14. Betriebsdokumentation aktualisieren

- [ ] `README.md` um den vollständigen Deploy-Ablauf für alle Edge Functions erweitern.
- [ ] Sparse-Checkout-Falle und vollständige Checkout-Anforderung dokumentieren.
- [ ] Produktions-Preflight für Owner-Migration dokumentieren.
- [ ] Beschreibung der AI-Feature-Flag-Logik ergänzen.
- [ ] Beschreibung des Offertenversand- und Retry-Verhaltens ergänzen.
- [ ] Kundenportal-Regel für mehrere Memberships dokumentieren.
- [ ] Hinweis ergänzen, dass AI keine Aktion direkt ausführt und alle CRM-Änderungen manuell bestätigt werden müssen.
- [ ] Datenschutztext gegen tatsächliche OpenAI-/Supabase-/Resend-Retention prüfen.
- [ ] Keine Zugangsdaten, Tokens, private URLs oder Kundentestdaten in die Dokumentation aufnehmen.

### 15. Abschlussprüfung

- [ ] `git status --short --branch` ist sauber.
- [ ] `git diff --check` ist sauber.
- [ ] `npm test` vollständig grün.
- [ ] `npm run check` grün.
- [ ] vollständige Playwright-Suite grün.
- [ ] vollständige Deno-Test-Suite grün.
- [ ] Produktionsmigration und Function-Deploys sind verifiziert.
- [ ] Live-Owner- und Live-Kundenfluss ist verifiziert.
- [ ] Live-Assets und cache-bustete private App-Assets sind verifiziert.
- [ ] Keine offenen P0/P1-Punkte in dieser Datei.
- [ ] Erst danach AI-Launcher beziehungsweise weitere produktive Features freischalten.

---

## Empfohlene Reihenfolge

1. Vollständigen Checkout herstellen.
2. Öffentliche Asset-Smoke-Tests ergänzen und ausführen.
3. AI-Numerik korrigieren.
4. AI-Chat-Rehydration ergänzen.
5. Offertenversand idempotent machen.
6. Multi-Membership-Entscheidung umsetzen.
7. CI ergänzen.
8. Supabase-Migration, Auth-Konfiguration und Functions in einer isolierten Umgebung prüfen.
9. Produktions-Deploy durchführen.
10. Echte Owner-/Kunden-End-to-End-Abnahme durchführen.
11. Cache-bustete Live-Verifikation und Abschlusscheck ausführen.
12. Erst dann produktiv freigeben.

# HEAV Passkey-Anmeldung

Stand: 9. November 2026. Implementiert auf dem bestehenden Dark-Design-Stand `e5a8df0`, Branch `dev/heav-passkeys-20261109`.

## Verhalten

- `/login`: Passkey zuerst, bestehende E-Mail-/Passwort-Anmeldung weiterhin sichtbar.
- `/account/security`: eigene Passkeys auflisten, hinzufügen, umbenennen (1–120 Zeichen) und nach Bestätigung entfernen. Link unter Konto.
- Bestehende Benutzer müssen sich einmal regulär anmelden und ihren ersten Passkey hinzufügen. Keine neuen Benutzerkonten werden automatisch angelegt.
- Bestehende Supabase-Identität, HttpOnly-Cookies und RLS bleiben erhalten. Der Browser erhält weder Access- noch Refresh-Token.
- Supabase übernimmt WebAuthn-Signaturen, Origin/RP-Prüfung, Benutzerverifikation, Ablauf und einmalige Verwendung der Challenges sowie die Credential-Speicherung. Keine eigene Datenbankmigration und kein Service-Role-Schlüssel nötig.
- Clerk-Modus bleibt bei dessen vorhandenen SignIn/UserProfile-Komponenten; der neue Supabase-Endpunkt ist dort gesperrt. Änderungen sind auch in der gemeinsamen Preview ohne Login gesperrt.

## Freischaltung erfolgt — echter Anmeldetest noch offen

Am 9. November 2026 nach Anmeldung des Benutzers in Safari im verbundenen Projekt `bkazlpqjvbuhwmjcwexn` aktiviert. Das Dashboard bestätigte „Passkey settings updated successfully“. Ein anschliessender echter `POST /auth/v1/passkeys/authentication/options` lieferte HTTP 200, eine Challenge und `rpId: os.michiastegegne.com`. Die Passkey-Einstellung wurde gespeichert; die CRM-Anwendung wurde nicht produktiv ausgerollt.

Gespeicherte Konfiguration in Supabase → Authentication → Passkeys:

- Display Name: `HEAV CRM`
- RP ID: `os.michiastegegne.com` (bisherige CRM-Produktionsdomain)
- Origins: `https://os.michiastegegne.com`

RP ID nach der ersten Registrierung nicht ändern: vorhandene Passkeys wären danach unbrauchbar. Zufällige `vercel.app`-Previews und `localhost` können keine Passkeys dieser RP ID verwenden. Für einen vollständigen Test entweder eine passende stabile Subdomain mit derselben RP ID/erlaubtem Origin verwenden oder ein separates lokales/Test-Auth-Projekt mit RP ID `localhost` konfigurieren. Keine bestehende Produktions-RP-ID für lokale Tests ersetzen.

Abhängigkeiten sind exakt gepinnt: Supabase JS 2.114.0, SSR 0.12.7 und SimpleWebAuthn Browser 13.2.2. Supabase kennzeichnet seine Passkey-API als experimentell; das Opt-in ist nur im Session-Client gesetzt.

Dokumentation: https://supabase.com/docs/guides/auth/passkeys

## Prüfungen und Grenzen

- TypeScript und Produktionsbuild erfolgreich.
- 129 bestehende Tests und 6 neue ausführbare Route-Tests erfolgreich (135 insgesamt).
- Neue Route-Tests verwenden einen simulierten Auth-Provider: Login-Start/Verifikation ohne Token-Ausgabe, Registrierung/Umbenennung/Löschen, anonyme Zugriffssperre, Origin-Prüfung, Eingabevalidierung, Preview-/Clerk-Sperre und Weitergabe von Provider-Fehlern. Sie ersetzen keine kryptografische WebAuthn-Verifikation gegen das echte Backend.
- Browser: Desktop und 390px Mobilansicht in Dark Mode geprüft; Passkey-Button ruft die echte Route auf und zeigte vor der Aktivierung einen verständlichen Fallback-Hinweis. Passwortformular bleibt bedienbar. Nach der Aktivierung wurde der echte Auth-Challenge-Endpunkt erfolgreich mit HTTP 200 geprüft.
- Anonymer Aufruf von `/account/security` leitet zum Login; Passkey-Liste liefert 401. Ungültige Passwort-Eingaben werden weiterhin abgelehnt.
- Ein echter erfolgreicher Passwortlogin, Passkey-Registrierung und erneuter Login sind noch nicht verifiziert: dafür fehlen die Veröffentlichung dieser Implementierung auf der erlaubten Domain und ein angemeldetes Testkonto. Keine Passkeys für den Benutzer angelegt oder entfernt.
- Der separate Lint-Befehl ist bereits im Projekt nicht nutzbar, weil eine ESLint-9-Konfigurationsdatei fehlt. Build/Typprüfung laufen durch.

## Abschliessender Funktionstest nach Freischaltung

1. Auf der erlaubten Domain mit bestehender E-Mail und Passwort anmelden.
2. Konto → Passkeys verwalten → Passkey hinzufügen; Betriebssystem-Prompt selbst bestätigen.
3. Passkey umbenennen, Seite neu laden und Namen prüfen.
4. Abmelden, mit Passkey erneut anmelden und dieselben vorhandenen CRM-Daten prüfen.
5. Abmelden, E-Mail/Passwort-Fallback erfolgreich testen.
6. Einen explizit dafür erstellten Test-Passkey entfernen; erneute Anmeldung damit muss scheitern, Passwort weiterhin funktionieren.

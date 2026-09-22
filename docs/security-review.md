# Security- und Privacy-Prüfung

Stand: 22. September 2026. Geprüft wurde die bereinigte Portfolio-Arbeitskopie. Die bestehende private Anwendung, ihre Environment-Dateien und ihre Datenbank wurden für diese Prüfung nicht verwendet oder verändert.

## Ergebnis

In den geprüften Grenzen zwischen öffentlicher Demo und privatem Backend wurden keine veröffentlichungsblockierenden Sicherheitsbefunde festgestellt. Die Demo benötigt keine Credentials und verwendet ausschließlich fiktive lokale Daten. Dieses Ergebnis gilt für die geprüfte Konfiguration; es ist keine pauschale Garantie für später eingerichtete Hosting- oder Auth-Projekte.

## Datenschutz beim Veröffentlichen

- Der ursprüngliche private Quellstand und dessen Historie enthielten persönliche Kontobezüge und Produktionsadressen in Dokumentation und Integrationstests. Diese gehören nicht in den öffentlichen Export.
- Der Portfolio-Stand enthält keine produktiven Environment-Dateien, Hosting-Verknüpfungen, Datenexporte, echten Hochschulunterlagen oder alten Git-Objekte. Die öffentliche Historie beginnt mit einem eigenständigen initialen Stand.
- Die bereinigten Dateien wurden auf persönliche/produktive Referenzen und gängige Credential-Formate geprüft. Dabei wurden keine entsprechenden Werte erkannt. Eine Mustersuche allein kann unbekannte Secret-Formate nicht ausschließen.
- Die Demo-Fixtures sind neu erstellte Beispieldaten mit eigenen IDs, relativen fiktiven Terminen und synthetischen Rückmeldungen. Die Beispiel-PDFs sind eigens für die Demo erstellt.

## Geprüfte Schutzmechanismen

| Grenze | Umsetzung |
| --- | --- |
| Betriebsmodus | Ohne Konfiguration startet die Demo. Nur `COCKPIT_MODE=private` aktiviert das private Backend. Unbekannte Werte werden abgelehnt. |
| Versehentliche Credentials | Ein Demo-Build mit gesetzter Datenbank-, Supabase- oder Besitzerkonfiguration wird abgelehnt; Werte werden dabei nicht ausgegeben. |
| Direkte Backend-Aufrufe | Proxy und einzelne API-, Auth- sowie Discovery-Handler sperren Demo-Anfragen vor der Verarbeitung. |
| Datenbank, Storage und Auth | Die jeweiligen Server-Hilfsfunktionen prüfen den Betriebsmodus zusätzlich vor dem Zugriff auf Credentials, Cookies oder Dienste. |
| Browseränderungen | Der Demo-Adapter verarbeitet Änderungen ausschließlich im Arbeitsspeicher. Unbekannte Endpunkte fallen nicht auf einen echten Netzwerkaufruf zurück. |
| Materialien | Demo-Downloads verwenden eine feste Auswahl öffentlicher Beispiel-PDFs. Uploads, Materialänderungen und echte Agentenschlüssel sind deaktiviert. |
| Lokale Tests | Der Teststarter übernimmt keine Cloud-Credentials. Direkte Testaufrufe mit konfigurierten Diensten werden vor der Fixture-Erstellung abgewiesen. Datenbanktests verwenden lokale PGlite-Instanzen. |

Die bestehenden privaten Kontrollen wurden an ihren zentralen Aufrufstellen geprüft: bestätigte Besitzer-Sitzung, getrennte Agentenrechte, Origin-Prüfung bei Browser-Schreibzugriffen, nutzerbezogene parametrisierte Datenbankabfragen, Revisionen, Idempotenz und Berechtigungsprüfung vor privaten PDF-Links.

## Tatsächlich geprüfte Abläufe

Die lokalen Prüfprotokolle enthalten **224 erfolgreiche Checks**: 52 Demo-/Isolationsprüfungen sowie 172 bestehende Upload-, Datenbank-, OAuth- und Planungsprüfungen. Die Isolationsprüfungen verwenden ausdrücklich fiktive Credential-Platzhalter, rufen Handler auch ohne Proxy auf und prüfen, dass dabei keine ausgehenden HTTP-Aufrufe erfolgen. Zusätzlich wurden zurückgewiesene direkte Testaufrufe mit konfigurierter Datenbank geprüft. Build, TypeScript und ESLint liefen lokal erfolgreich.

Der anschließende Dependency-Check meldete zunächst neun betroffene Paket-Einträge. Kompatible transitive Updates und das Entfernen des optionalen `drizzle-kit`-Generators beseitigten diese Treffer; Drizzle-Schema und SQL-Migrationen blieben erhalten. Nach einer sauberen Installation meldete `npm audit --json` **0 bekannte Schwachstellen** über alle Abhängigkeitsklassen. Build, TypeScript, ESLint und sämtliche 224 lokalen Checks bestanden auch mit diesem finalen Lockfile. Das ist eine Momentaufnahme veröffentlichter Advisories, keine vollständige Prüfung des Drittanbieter-Codes.

Die fünf Portfolio-Screenshots wurden auf personenbezogene Inhalte geprüft. Sie zeigen ausschließlich die fiktiven Demo-Module, Lernblöcke und Lernstände. Persönliche Kontodaten, Produktionsadressen und echte Hochschulunterlagen sind darin nicht sichtbar.

Am lokal gestarteten Production-Build bestanden außerdem **21 HTTP-Prüfungen**: 17 direkte Backend-/Auth-Zugriffe wurden mit HTTP 404 gesperrt, beide Beispiel-PDFs waren erreichbar, `/` leitete nach `/demo` weiter und die Demo antwortete mit ihrer Content Security Policy. Eine manuelle Browserprüfung bestätigte eine lokale Lernblockänderung samt Zurücksetzen, unveränderte Quellen und Wochenbudgets sowie die Heute-Ansicht bei 390 Pixel Breite ohne horizontalen Überlauf. Die Browser-Konsole zeigte am geprüften Punkt keine Fehler oder Warnungen. Diese beobachteten lokalen Prüfungen sind keine automatisierte Ende-zu-Ende-Testsuite und keine Prüfung eines öffentlichen Deployments.

## Grenzen

Es wurden keine Produktionsdaten abgefragt, keine Cloud-Berechtigungen verändert und keine Migrationen auf einem bestehenden System ausgeführt. Ein tatsächliches öffentliches Deployment, ein vollständiger OAuth-Ablauf mit einem externen Fachchat und echte Storage-Zugriffe waren nicht Teil dieser Prüfung. Drittanbieter-Code und sämtliche darstellungsbezogenen UI-Pfade wurden nicht vollständig sicherheitsgeprüft.

Eine öffentliche Demo gehört in ein neues, separates Hosting-Projekt ohne private Credentials. Für eine bewusst eingerichtete private Instanz gelten zusätzlich [SECURITY.md](../SECURITY.md) und die [Einrichtungsanleitung](private-instance.md).

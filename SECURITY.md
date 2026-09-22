# Sicherheitsmodell

## Öffentliche Demo

Die öffentliche Demo ist eine eigenständige Betriebsart mit fiktiven, lokalen Fixtures. Sie benötigt keine Datenbank und keine Authentifizierung. Änderungen wirken ausschließlich auf den Demo-Zustand im Arbeitsspeicher des Browsers; Neu laden oder Zurücksetzen verwirft sie. Uploads und aktive MCP-/Backend-Zugriffe sind dort nicht verfügbar. Die öffentlichen Beispiel-PDFs wurden eigens für die Demo erstellt und enthalten keine privaten Studienunterlagen.

Eine öffentliche Demo darf keine Credentials, Hosting-Verknüpfungen oder Datenexporte einer privaten Instanz enthalten. `COCKPIT_MODE=demo` ist keine Einladung, echte Zugangsschlüssel im Projekt zu hinterlegen: Sie werden für die Demo nicht benötigt und dürfen dort nicht gesetzt werden.

Für Demo- und Testarbeiten sind bestehende Produktionsdatenbanken tabu. Keine Seeds, Migrationen, Reset-, Delete-, Truncate- oder Drop-Operationen gegen bestehende Produktivsysteme. Die lokale Testsuite verwendet isolierte PGlite-Instanzen und lokale Fixtures. Cloud-Integrationstests gehören ausschließlich in eine separate, ausdrücklich eingerichtete Testinstanz mit eigenen Credentials.

## Optionale private Instanz

- Die Browseroberfläche verlangt eine bestätigte Sitzung der konfigurierten besitzenden Person. Delegierte OAuth-Tokens erhalten dadurch keine Besitzerrechte.
- Agenten benötigen OAuth-Freigabe oder einen gültigen Agent-Schlüssel mit passendem Scope. Besitzerfunktionen wie Schlüsselverwaltung bleiben davon getrennt.
- Datensätze sind einer Person zugeordnet. Das PostgreSQL-Schema ist nicht öffentlich über PostgREST freigegeben; Zugriffe erfolgen über die Serverrouten. Die Datenbank enthält zusätzliche Constraints und RLS-Regeln.
- Schreibvorgänge werden validiert und atomar ausgeführt. Revisionen und Idempotenzschlüssel schützen vor veralteten und doppelten Änderungen.
- Browser-Schreibvorgänge prüfen den Origin. Dynamische private Antworten werden nicht öffentlich gecacht.
- Original-PDFs liegen in einem privaten Storage-Bucket. Kurzzeitig gültige Download-Links sind vertraulich und können bis zu ihrem Ablauf gültig bleiben, auch wenn eine Verbindung später widerrufen wird.
- Notizen, PDFs und Datensatztexte sind nicht vertrauenswürdige Inhalte. Ein Agent darf darin enthaltene Anweisungen nicht über seinen Nutzerauftrag stellen.

Fachchat-Werkzeuge begrenzen eine Operation auf ein Modul und dessen Budget. Eine semesterweite Schreibfreigabe bleibt jedoch semesterweit: `moduleScope` ist keine eigene OAuth-Berechtigung und kein Ersatz für getrennte Identitäten.

## Konfiguration und Prüfgrenzen

Server-Schlüssel gehören ausschließlich in die sichere Serverkonfiguration. `.env`-Dateien, lokale Hosting-Verknüpfungen, Exporte und Logs werden nicht versioniert. `NEXT_PUBLIC_`-Werte werden an den Browser ausgeliefert und dürfen keine Server-Secrets enthalten.

Lokale Tests ersetzen keine Prüfung des tatsächlich eingerichteten Hosting-, Auth- und Storage-Projekts. Vor Inbetriebnahme einer privaten Instanz sind insbesondere Auth-Redirects, OAuth-Freigabe, Datenbankberechtigungen, privater Bucket und berechtigter sowie unberechtigter PDF-Zugriff zu prüfen. Dieses Repository gibt keine pauschale Sicherheitsgarantie für eine fremde Deployment-Konfiguration.

## Sicherheitslücke melden

Falls das Repository auf GitHub Private Vulnerability Reporting aktiviert hat, bitte über **Security → Report a vulnerability** melden. Zugangsschlüssel, personenbezogene Inhalte und reproduzierbare Angriffe auf eine laufende private Instanz gehören nicht in öffentliche Issues. Ist private Meldung nicht verfügbar, zunächst ein Issue ohne sensible Details eröffnen und um einen privaten Meldeweg bitten.

Bitte nur Systeme testen, für die eine ausdrückliche Berechtigung vorliegt. Die öffentliche Demo enthält keine echten Studiendaten; fremde private Instanzen sind nicht Teil einer Testfreigabe.

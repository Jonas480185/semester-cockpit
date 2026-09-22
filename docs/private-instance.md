# Optionale private Instanz

Für das Ausprobieren und die öffentliche Portfolio-Demo ist diese Einrichtung nicht nötig. Die Demo läuft mit `COCKPIT_MODE=demo` und ohne Cloud-Zugang.

Die private Betriebsart enthält den ursprünglichen authentifizierten Backend-Ablauf. Sie ist für eine eigene, getrennte Installation gedacht. Eine bestehende Produktionsinstanz wird durch die Einrichtung dieses Repositorys nicht verbunden, verändert oder migriert.

## Voraussetzungen

- Ein eigenes Next.js-Hosting-Projekt, getrennt von jeder öffentlichen Demo.
- Ein separates Supabase-Projekt mit PostgreSQL, Auth und Storage.
- Eine bestätigte E-Mail-Adresse für die besitzende Person.
- Serverseitig verwaltete Credentials aus diesem neuen Projekt.

Vor jedem Datenbank- oder Storage-Einrichtungsschritt muss die Zielumgebung eindeutig geprüft werden. Verwende keinen Link und keine Zugangsdaten einer bestehenden produktiven Anwendung. SQL-Dateien im Repository sind Strukturbeschreibungen für eine neue Instanz; sie werden bei Demo-Start, Build oder Deployment nicht automatisch auf eine entfernte Datenbank angewendet.

## Einrichtung

1. Die Variablen aus `.env.example` in der privaten Serverkonfiguration setzen und `COCKPIT_MODE=private` ausdrücklich aktivieren. `APP_URL` muss zur tatsächlichen privaten Domain passen.
2. Die versionierten SQL-Dateien unter `supabase/migrations/` in zeitlicher Reihenfolge prüfen und ausschließlich auf die dafür neu angelegte Datenbank anwenden. Das Schema `semester` bleibt außerhalb der öffentlichen PostgREST-Schemas; Entzug der allgemeinen Grants und RLS bleiben erhalten.
3. Für die PostgreSQL-TLS-Verbindung die CA der eigenen Installation prüfen. Der Client verifiziert entfernte Verbindungen mit dem Zertifikat unter `certs/`; Zertifikatsprüfung nicht deaktivieren.
4. Den Storage-Bucket `semester-materials` als **privat** anlegen. Upload-Limit 20 MiB; erlaubter Typ `application/pdf`. Keine öffentliche Download-Policy hinzufügen.
5. In Supabase Auth die Site-URL und Redirect-URLs passend zur eigenen Domain konfigurieren. Die erlaubte E-Mail-Adresse in `COCKPIT_OWNER_EMAIL` setzen. Die Oberfläche verwendet einen Anmeldelink per E-Mail.
6. Für OAuth-basierte MCP-Clients den Supabase OAuth-Server und die Consent-Seite der Anwendung einrichten. Die Consent-Route lautet `/oauth/consent`. Exakte Redirects und Client-Freigaben hängen vom verwendeten MCP-Client ab; die Einrichtung in einer isolierten Instanz tatsächlich testen.
7. Authentifizierten Zugriff, Widerruf und private Dateien prüfen, bevor persönliche Daten importiert werden. Ein neuer Arbeitsbereich startet leer; dieses Repository liefert keinen Import produktiver Inhalte.

Die öffentliche Demo darf diese Variablen nicht erhalten. Der Demo-Build weist eine versehentliche Backend-Konfiguration zurück. `/demo` bleibt auch in einer privaten Instanz eine isolierte Ansicht mit Fixtures.

## Agentenzugriff

Der MCP-Endpunkt einer eingerichteten privaten Instanz liegt unter `https://<eigene-domain>/api/mcp`. OAuth benötigt eine Freigabe durch die besitzende Person. Alternativ können autorisierte HTTP-Clients einen in der Anwendung angelegten Agent-Schlüssel als Bearer-Token verwenden.

Der Server liefert Werkzeugdefinitionen einschließlich Eingabeschema. Ein frischer Fachchat liest zuerst `semester_module_context`, ruft benötigte Originalunterlagen gezielt mit `semester_material_download` ab und speichert seine Rückmeldung über `semester_module_feedback`. Details stehen im [Agentenleitfaden](../public/agent-guide.md).

Ein Download-Link ist kurzfristig gültig und vertraulich. Der MCP-Client braucht eine Funktion zum tatsächlichen Abrufen beziehungsweise Lesen der PDF; ein angezeigter Dateiname allein liefert noch keinen Dateiinhalt.

## Abnahme einer neuen privaten Installation

Die folgenden Schritte benötigen die neue isolierte Instanz und sind nicht durch den lokalen Demo-Test ersetzt:

- Bestätigte Besitzeranmeldung funktioniert; fremde oder unbestätigte Anmeldung wird abgelehnt.
- Agent mit Leseberechtigung kann lesen, aber nicht schreiben; Schreibfreigabe erlaubt nur die vorgesehenen Datenoperationen.
- Veraltete Revisionen und doppelte Anfragen führen nicht zu doppelten Änderungen.
- Eine eigene kleine Test-PDF lässt sich zu einem Testmodul hochladen, öffnen, über MCP abrufen und nach Entfernen der Quellenverweise löschen.
- Ohne Berechtigung bleiben Metadaten, Originaldatei und Backend unzugänglich.
- Neue Fachchat-Sitzung findet Thema, Quelle, Rückmeldung und nächsten Schritt ohne alten Chatverlauf.
- Widerrufene Verbindungen können keine neuen Zugriffe erhalten; zuvor ausgegebene signierte Links laufen spätestens nach ihrer Gültigkeit ab.

Keine dieser Prüfungen soll gegen eine bereits genutzte produktive Datenbank laufen.

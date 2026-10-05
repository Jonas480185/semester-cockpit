# Entwicklung und Betrieb

Diese Anleitung gehört zur öffentlichen Portfolio-Fassung. Für den schnellen Einstieg siehe [README](../README.md#lokal-starten). Die Demo läuft mit fiktiven Daten im Browser; eine private Instanz muss separat eingerichtet werden.

## Konfiguration

`.env.example` enthält ausschließlich Platzhalter und aktiviert die Demo. Lokale `.env`-Dateien werden nicht versioniert.

| Variable | Zweck | Demo |
| --- | --- | --- |
| `COCKPIT_MODE` | `demo` für die öffentliche Demo; `private` nur für eine getrennt eingerichtete private Instanz | `demo` |
| `APP_URL` | Öffentliche Basis-URL für Weiterleitungen und OAuth | nicht benötigt |
| `DATABASE_URL` | Serverseitiger PostgreSQL-Zugang | nicht setzen |
| `NEXT_PUBLIC_SUPABASE_URL` | URL des eigenen Supabase-Projekts | nicht setzen |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Öffentlicher Supabase-Client-Schlüssel | nicht setzen |
| `SUPABASE_SECRET_KEY` | Serverseitiger Storage-Schlüssel; alternativ `SUPABASE_SERVICE_ROLE_KEY` | nicht setzen |
| `COCKPIT_OWNER_EMAIL` | Für die private Oberfläche zugelassene, bestätigte E-Mail-Adresse | nicht setzen |

Öffentliche Supabase-Client-Werte sind kein Ersatz für Zugriffskontrollen. Datenbank- und Server-Schlüssel gehören ausschließlich in die Serverkonfiguration. Die [Anleitung für eine private Instanz](private-instance.md) beschreibt die zusätzlichen Voraussetzungen.

## Befehle

| Befehl | Funktion |
| --- | --- |
| `npm run dev` | Lokaler Next.js-Entwicklungsserver |
| `npm run build` | Production-Build und Framework-Prüfungen |
| `npm start` | Gebauten Next.js-Server starten |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript-Prüfung ohne Ausgabe |
| `npm test` / `npm run test:local` | Lokale Tests mit isolierten Fixtures |

Das Drizzle-Schema und die SQL-Migrationen beschreiben das Datenmodell der privaten Instanz. Für die Demo wird keine Migration ausgeführt.

Die lokale Testsuite entfernt Cloud-Credentials aus ihrer Umgebung und verwendet temporäre lokale Datenbanken. Sie prüft unter anderem Validierung, Zugriffskontrollen, Revisionen, Idempotenz, Fachchat-Rückmeldungen, Umplanung und Uploadclient-Abläufe. Echter Supabase-Storage und ein vollständiger OAuth-Ablauf eines externen Chat-Clients benötigen zusätzliche Integrationstests in einer separaten Testinstanz.

## Deployment der öffentlichen Demo

1. Ein **neues** Hosting-Projekt aus diesem Repository anlegen.
2. Next.js als Framework verwenden; Installation `npm ci`, Build `npm run build`.
3. Ausschließlich `COCKPIT_MODE=demo` setzen. Keine Supabase-Integration verknüpfen und keine Environment-Variablen einer privaten Anwendung übernehmen.
4. `/demo` und die Isolation der Demo prüfen. Backend-Endpunkte müssen im Demo-Modus blockiert bleiben.

Die Demo braucht keine Datenbank und keinen Seed.

## Projektstruktur

```text
app/                    Seiten, UI-Komponenten und serverseitige Routen
lib/                    Datenmodell, Validierung, Planung, MCP und Authentifizierung
db/                     Drizzle-Schema
supabase/migrations/    SQL-Struktur der optionalen privaten Instanz
tests/                  Lokale Fach- und Sicherheitstests
scripts/                Entwicklungs- und Testwerkzeuge
public/                 Öffentliche Assets und Agentenleitfaden
docs/                   Screenshots und technische Erläuterungen
```


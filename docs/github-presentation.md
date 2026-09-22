# GitHub-Präsentation

## Repository

Name: `semester-cockpit`

Beschreibung:

> Lernorganisation mit Next.js und TypeScript: Semesterplanung, Themen, Lernblöcke und Lernstand. Mit isolierter Demo und MCP-Schnittstelle für Fachchats in der privaten Instanz.

Topics:

```text
nextjs typescript react tailwindcss postgresql supabase mcp
study-planner learning-dashboard portfolio-project
```

Als Website-Link eignet sich ausschließlich die URL einer getrennt bereitgestellten öffentlichen Demo. Eine private Instanz oder deren MCP-Endpunkt gehört nicht in die Repository-Metadaten.

## Kurze Portfolio-Story

Das Projekt entstand im eigenen Studium: Termine, Unterlagen und Lernstand waren auf mehrere Werkzeuge und Chats verteilt. Semester Cockpit bündelt diese Informationen und macht daraus einen konkreten Tagesplan. Die private Anwendung wird genutzt; dieses Repository zeigt die technische Umsetzung anhand fiktiver Daten.

Die wichtige Produktentscheidung ist die Trennung von Organisation und Lernen. Das Cockpit speichert Themen, Budgets, Nachweise und nächste Schritte. Fachchats übernehmen Erklärungen und Korrektur und können über MCP auf denselben Kontext zugreifen. Erledigte Aufgaben werden nicht automatisch mit Verständnis gleichgesetzt.

Technisch zeigt das Projekt eine durchgängige TypeScript-Anwendung mit gemeinsamem Datenmodell, validierten und atomaren Schreibvorgängen, Schutz vor doppelten und konkurrierenden Änderungen sowie getrennten Zugriffsrechten für Oberfläche und Agenten. Die öffentliche Demo verwendet dieselben Ansichten, läuft aber ohne Backend-Credentials.

## Veröffentlichung

- Mit einem neuen, bereinigten Initial-Commit beginnen; keine private Git-Historie übernehmen und keine künstlichen Arbeits-Commits erzeugen.
- Die vorhandenen Screenshots aus `docs/images/` verwenden; keine Bilder einer privaten Sitzung hinzufügen.
- Den lokalen Build, Lint, Typprüfung und Tests ausführen. Die Ergebnisse stehen nicht stellvertretend für einen Cloud-Sicherheitsnachweis.
- Die öffentliche Demo in einem neuen Projekt ohne übernommene Credentials bereitstellen.
- GitHub Private Vulnerability Reporting aktivieren, falls für das Repository verfügbar.
- Die MIT-Lizenz bezieht sich auf den veröffentlichten Code und die fiktiven Projektinhalte, nicht auf fremde Studienunterlagen.

Die öffentliche Fassung ist ein eigenständiger Stand. Spätere Änderungen aus einer privaten Weiterentwicklung müssen erneut auf personenbezogene Daten, Zugangsdaten und interne Deployment-Informationen geprüft werden.

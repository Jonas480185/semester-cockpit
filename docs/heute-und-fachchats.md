# Heute und Fachchats

Dieses Dokument beschreibt das vollständige Verhalten einer eingerichteten privaten Instanz. Die öffentliche Portfolio-Demo verwendet nur fiktive lokale Daten; MCP, private Dateiabrufe und persistente Rückmeldungen sind dort nicht aktiv. Verlinkte Demo-PDFs sind öffentliche, eigens erstellte Beispiele.

Das Cockpit plant, die Fachchats begleiten das Lernen. Auf **Heute** stehen Fach, Thema, Zeit, Dauer, Lernziel und vorhandene Quellen. „Für Fachchat kopieren“ enthält Modul-, Themen- und Aufgaben-ID. Der Chat liest den aktuellen Kontext selbst über MCP. Nach dem Lernen speichert er eine kurze Rückmeldung und überprüft sie durch erneutes Lesen. **Heute** zeigt offene Blöcke von heute, sonst bis zu drei nächste Blöcke. Erledigte Blöcke verdecken den nächsten Termin nicht. Unter „Nach dem Fachchat“ stehen gespeicherte Rückmeldungen und die daraus übernommenen nächsten Schritte; fehlende blockbezogene Rückmeldungen werden neutral angezeigt.

## Gemeinsames Datenmodell

- `topics`: dauerhafte Themen; `position` (0 = Reihenfolge nicht festgelegt), `plannedStart` und `plannedEnd` für den groben Semesterrahmen. Fehlende Quellenprüfung wird ausdrücklich angezeigt.
- `tasks`: konkrete Blöcke mit `goal` und optional `instructions`. Bestehende `sourceMaterialId`, PDF-Seiten und Aufgabennummer bleiben unverändert. Neue oder verschobene Termine höchstens 13 Tage nach heute; vorhandene spätere Blöcke können weiterhin gelesen und ohne Terminänderung gepflegt werden.
- `plans`: bisherige Semesterpläne bleiben erhalten. `moduleId: null` ist zentrale Planung, eine Modul-ID ein festes Wochenbudget (Montag bis Sonntag). Budgets werden manuell zentral verteilt, nicht aus bestehenden Aufgaben erfunden. Für länger laufende Bestandspläne wird kein Wochenbudget geraten.
- `sessions`: die gemeinsame Lernzeitbasis mit `taskId`, `assistance`, `difficulty`, `nextStep`, serverseitiges `recordedAt`. `minutes: 0` bedeutet unbekannt. Kein zweites Fortschrittsmodell; die Schwierigkeit wird nicht zusätzlich automatisch als Wissenslücke kopiert.
- `audit.reason`: kurzer Änderungsgrund im vorhandenen Verlauf. Alte Clients bleiben nutzbar; ohne Grund wird das ausdrücklich dokumentiert.

Die vier sichtbaren Lernstände werden aus bestehenden Daten abgeleitet: noch nicht begonnen; in Bearbeitung (Selbsteinschätzung geändert); bearbeitet (Session, erledigter Block oder Test vorhanden); selbstständig bestätigt. Letzteres erfordert weiterhin Status `sicher` **und** den neuesten Test mit mindestens 80 % ohne Hilfe. Ein erledigter Block oder eine Rückmeldung „selbstständig“ reicht allein nicht. Fehlende Übung ist kein Rückstand; Hinweise beruhen auf überfälligen Blöcken/Wiederholungen, abgelaufenen Themenzeiträumen oder einer bevorstehenden Klausur.

## Modulübersicht

„Bereits gekonnt“ enthält nur selbstständig bestätigte Themen. „Aktuell und als Nächstes“ zeigt laufende Themen und offene Blöcke bis zum Planungshorizont; frühere offene Blöcke bleiben zur Klärung sichtbar. „Themenausblick bis zur Klausur“ enthält alle übrigen bekannten Themen. Ungeplante Themen und Termine nach der Klausur werden kenntlich gemacht. Quellen stammen ausschließlich aus vorhandenen Aufgabenverweisen; keine geratenen PDF-Zuordnungen.

Für die bestehenden Modul-IDs `mathematik`, `finance` (Investition und Finanzierung / FOF) und `rechnungswesen` ist vorhandener Stoff die Planungsgrundlage. Für `software-engineering` und `geschaeftsprozessmanagement` sind zusätzliche, noch unbekannte Veranstaltungsthemen ausdrücklich vorgesehen. Dies sind Darstellungsregeln, keine neuen Datensätze oder Aussage über geprüfte Stoffabdeckung. Vorhandene Reihenfolge wird verwendet; bei fehlender Position folgen vorgesehener Zeitraum und Titel, ohne eine fachliche Reihenfolge zu erfinden.

## MCP unter /api/mcp

Alle bisherigen Werkzeuge bleiben erhalten. `semester_module_context({moduleId})` liefert zusätzlich `topicOverview`, `currentPlan`, `laterExistingBlocks`, `weeklyBudgets`, `latestFeedback`, `nextStep`, `nextBlock`, `planChanges`, `coverage` und `concreteUntil`. Ergänzend liefern `roadmap` die drei Themengruppen mit Planungsgrundlage, `feedbackContract` den verbindlichen Rückmeldeablauf, `pendingFeedback` erledigte Blöcke ohne zugeordneten Bericht und `continuation` den nächsten Schritt samt Themen-, Block- und Rückmeldung-ID. Die ursprünglichen Felder (`topics`, `tasks`, `sessions`, Tests, Materialien usw.) bleiben verfügbar.

1. `semester_module_context({moduleId:"…"})` lesen. Die Antwort enthält die aktuelle `revision`, Regeln und passende Quellen-IDs.
2. Für das Original `semester_material_download({id:"…"})` aufrufen und die private PDF über den kurzfristigen Link abrufen. Dateien sind nicht im Snapshot enthalten.
3. `semester_module_feedback` nutzen:
   - erforderlich: `moduleId`, `topicId`, stabile `feedbackId`, `date` (YYYY-MM-DD), `assistance` (`selbstständig` oder `mit Hilfe`), `revision`, `idempotencyKey` (8–100 Zeichen)
   - optional: `taskId`, tatsächliche `minutes` (1–720; bei unbekannter Zeit weglassen), `difficulty`, `nextStep`, `notes`, `completed` (standardmäßig false)
   - `completed:true` schließt nur die genannte Aufgabe. Themenstatus und Testergebnisse werden nicht automatisch geändert.
4. Die Antwort liefert `feedbackReceipt` (gespeicherte IDs, `minutesKnown`, `nextStepProvided`) und `verifyWith`. Erneut `semester_module_context` aufrufen und die `feedbackId` in `sessions` prüfen. Der nächste Chat erhält `continuation` mit dem gespeicherten nächsten Schritt. Bei einem Schreibfehler ausdrücklich sagen, dass die Rückmeldung noch nicht gespeichert ist.
5. Zum Verschieben `semester_reschedule`:
   - erforderlich: `moduleId`, `revision`, `idempotencyKey`, `reason`, `moves`
   - `moves`: 1–40 Einträge `{taskId,date,time,minutes?}`; Uhrzeit HH:mm. Keine doppelten Task-IDs.
   - alle Änderungen atomar, nur Termin/Uhrzeit/optionale Dauer; IDs, Status, Quellen, Themen und Ergebnisse bleiben bestehen.
   - fehlendes/mehrdeutiges Fachbudget oder zusätzliches Überziehen => Konflikt, keine Änderungen. Überzogene Bestandspläne dürfen ohne weitere Erhöhung umgeordnet werden; Hinweise bleiben sichtbar.

Bei verlorener Antwort dieselbe Anfrage mit demselben Idempotenzschlüssel wiederholen. Eine erneute Feedback-Anlage mit derselben `feedbackId` und anderem Schlüssel wird als Duplikat abgelehnt. Bei 409 wegen veralteter Revision neu lesen, überarbeiten und einen neuen Schlüssel verwenden.

## Zentrale Planung und Grenzen

Fachchats nutzen die beiden gezielten Schreibwerkzeuge oder setzen beim vorhandenen `semester_write_batch` `moduleScope` auf ihre Modul-ID. Das prüft Modulzugehörigkeit und Fachbudget. Budgetänderungen gehören zur zentralen Semesterplanung: dort wird `semester_write_batch` ohne `moduleScope` verwendet; optionaler `reason` erklärt die Änderung. Die Oberfläche ist ebenfalls zentrale Planung und darf Konflikte bewusst speichern; sie zeigt sie anschließend im Lernplan.

Die vorhandene OAuth-Verbindung ist semesterweit schreibberechtigt. Eine separate technische Identität pro Fachchat wird nicht eingeführt. Der zentrale Batch-Zugang bleibt deshalb entsprechend der bisherigen Berechtigung erhalten; `moduleScope` ist keine neue OAuth-Sicherheitsgrenze. Die gezielten Werkzeuge erzwingen die beschriebenen Fachgrenzen serverseitig.

Budgets vergleichen reservierte Blöcke und dokumentierte Zeit plus offene Blöcke. Sie berücksichtigen Zeitüberschneidungen, aber kennen keine nicht eingetragenen privaten Termine. Der Wochenvorschlag ergänzt nur freie Zeiten innerhalb vorhandener Gesamt- und Fachbudgets; er erhöht keine Budgets. Originalunterlagen werden nicht automatisch fachlich analysiert. Eindeutige Quellen eines Themas können in Vorschlägen weiterverwendet werden; mehrere mögliche Quellen werden nicht geraten. Eine vollständige Stoffabdeckung ist nicht nachgewiesen.

Die Rückmeldung ist Teil des Fachchat-Auftrags und der MCP-Werkzeugbeschreibung. Ein externer Chat lässt sich technisch nicht zum Aufruf zwingen. Alte Clients dürfen optionale Felder weiter weglassen; für den neuen Ablauf sollen sie immer `taskId` (bei einem Lernblock), `difficulty` (auch „keine“) und einen konkreten `nextStep` liefern. Fehlende Zeit wird nicht geschätzt. Der nächste Schritt ist eine gespeicherte Empfehlung und erzeugt nicht automatisch einen weiteren Lernblock oder ein höheres Budget.

"use client";
import { materialHref } from "@/lib/client-request";
import { useState } from "react";
import {
  Copy,
  Clock3,
  ArrowRight,
  ExternalLink,
  Pencil,
  CheckCircle2,
} from "lucide-react";
import {
  type Snapshot,
  type Task,
  type Topic,
  type Plan,
  type Session,
  today,
  monday,
  offsetDate,
  riskReasons,
} from "@/lib/model";
import {
  fachchatPrompt,
  feedbackOrder,
  latestBlockFeedback,
  latestTopicFeedback,
  moduleRoadmap,
  nextLearningBlocks,
  curriculumPolicy,
  planningWarnings,
  taskOrder,
  topicOrder,
  topicSources,
  topicStage,
  weekSummary,
} from "@/lib/study-planning";

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" }).format(
    new Date(date + "T12:00:00Z"),
  );
const duration = (minutes: number) =>
  minutes < 60
    ? `${minutes} Min.`
    : `${(minutes / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Std.`;
const short = (title: string) =>
  title.length > 95 ? title.slice(0, 92) + "…" : title;
function FeedbackDetails({ feedback }: { feedback: Session }) {
  return (
    <details className="study-details">
      <summary>Rückmeldung · {dateLabel(feedback.date)}</summary>
      <p>
        {feedback.minutes ? duration(feedback.minutes) : "Zeit nicht angegeben"}{" "}
        ·{" "}
        {feedback.assistance === "unbekannt" || !feedback.assistance
          ? "Hilfebedarf nicht dokumentiert"
          : feedback.assistance}
      </p>
      {feedback.notes && <p>{feedback.notes}</p>}
      {feedback.difficulty && (
        <p>
          <b>Offen:</b> {feedback.difficulty}
        </p>
      )}
      <p className="study-muted">
        Gespeichert · Rückmeldung-ID: <code>{feedback.id}</code>
      </p>
    </details>
  );
}
export function SourceLink({ task }: { task: Task }) {
  return task.sourceMaterialId ? (
    <a
      className="study-source"
      href={materialHref(task.sourceMaterialId, task.sourcePageStart)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <ExternalLink size={14} /> Original-PDF
      {task.sourcePageStart
        ? ` · S. ${task.sourcePageStart}${task.sourcePageEnd ? "–" + task.sourcePageEnd : ""}`
        : ""}
      {task.sourceExercise ? ` · Aufgabe ${task.sourceExercise}` : ""}
    </a>
  ) : null;
}
export function WeekBudget({
  data,
  start = monday(today()),
  editPlan,
}: {
  data: Snapshot;
  start?: string;
  editPlan?: (plan: Plan | undefined, defaults: Partial<Plan>) => void;
}) {
  const total = weekSummary(data, start),
    warnings = planningWarnings(data, start);
  const edit = (moduleId?: string) =>
    editPlan?.(
      data.plans.find(
        (p) =>
          (p.moduleId || null) === (moduleId || null) &&
          p.startDate === start &&
          p.endDate === offsetDate(start, 6),
      ),
      {
        moduleId: moduleId || null,
        startDate: start,
        endDate: offsetDate(start, 6),
        title: moduleId
          ? `Fachbudget ${data.modules.find((m) => m.id === moduleId)?.code}`
          : "Wochenbudget",
        targetMinutes: 0,
      },
    );
  return (
    <section className="panel study-week">
      <div className="study-section-head">
        <div>
          <h2>
            {start === monday(today()) ? "Diese Woche" : "Wochenübersicht"}{" "}
            <span>
              {dateLabel(start)} – {dateLabel(total.end)}
            </span>
          </h2>
          <p>Budget, geplante Blöcke und tatsächlich dokumentierte Zeit.</p>
        </div>
        {editPlan && (
          <button className="text-button" onClick={() => edit()}>
            <Pencil size={14} /> Gesamtbudget
          </button>
        )}
      </div>
      <div className="study-week-stats">
        <div>
          <small>Wochenbudget</small>
          <b>{total.budget === null ? "Noch offen" : duration(total.budget)}</b>
        </div>
        <div>
          <small>Geplante Blöcke</small>
          <b>{duration(total.planned)}</b>
        </div>
        <div>
          <small>Dokumentiert</small>
          <b>{duration(total.documented)}</b>
        </div>
        <div>
          <small>Offene Blöcke</small>
          <b>{duration(total.remaining)}</b>
        </div>
      </div>
      <div className="study-week-days">
        {Array.from({ length: 7 }, (_, i) => {
          const date = offsetDate(start, i),
            tasks = data.tasks.filter((t) => t.date === date),
            minutes = tasks.reduce((sum, t) => sum + t.minutes, 0);
          return (
            <div key={date} className={date === today() ? "current" : ""}>
              <span>{["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][i]}</span>
              <b>{minutes ? duration(minutes) : "–"}</b>
              <div className="study-day-dots">
                {[
                  ...new Set(
                    tasks.map(
                      (t) =>
                        data.topics.find((x) => x.id === t.topicId)?.moduleId,
                    ),
                  ),
                ].map((id) => (
                  <i
                    key={id}
                    style={{
                      background: data.modules.find((m) => m.id === id)?.color,
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {!!warnings.length && (
        <div className="study-conflicts" role="status">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
      <details className="study-details">
        <summary>Fachbudgets & Lernzeit</summary>
        <div className="study-budget-list">
          {data.modules.map((m) => {
            const s = weekSummary(data, start, m.id);
            return (
              <div key={m.id}>
                <span>
                  <i className="module-dot" style={{ background: m.color }} />
                  {m.title}
                </span>
                <small>
                  {duration(s.planned)} geplant · {duration(s.documented)}{" "}
                  dokumentiert
                </small>
                {editPlan ? (
                  <button className="text-button" onClick={() => edit(m.id)}>
                    {s.budget === null
                      ? "Budget festlegen"
                      : duration(s.budget) + " Budget"}
                  </button>
                ) : (
                  <span>
                    {s.budget === null
                      ? "Budget offen"
                      : duration(s.budget) + " Budget"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <p className="study-muted">
          Fachbudgets werden hier zentral verteilt. Verschiebungen ändern sie
          nicht. Ohne eindeutiges Fachbudget fordert der Fachchat eine zentrale
          Planung an.
        </p>
      </details>
    </section>
  );
}
export function TodayView({
  data,
  editTask,
  editSession,
  openPlan,
  editPlan,
}: {
  data: Snapshot;
  editTask: (task: Task) => void;
  editSession: (task: Task) => void;
  openPlan: () => void;
  editPlan: (plan: Plan | undefined, defaults: Partial<Plan>) => void;
}) {
  const [copied, setCopied] = useState(""),
    [error, setError] = useState("");
  const blocks = nextLearningBlocks(data),
    todays = blocks.filter((t) => t.date === today()),
    pendingFeedback = data.tasks
      .filter(
        (t) => t.status === "erledigt" && !latestBlockFeedback(data, t.id),
      )
      .sort(taskOrder),
    feedbackByModule = data.modules.flatMap((m) => {
      const ids = new Set(
        data.topics.filter((t) => t.moduleId === m.id).map((t) => t.id),
      );
      const last = data.sessions
        .filter((s) => ids.has(s.topicId))
        .sort(feedbackOrder)[0];
      return last ? [{ module: m, feedback: last }] : [];
    });
  const overdue = data.tasks.filter(
    (t) => t.date < today() && t.status === "offen",
  );
  return (
    <div className="today-layout">
      <section>
        <div className="study-section-head">
          <div>
            <h2>
              {todays.length
                ? "Deine Lernblöcke"
                : blocks.length
                  ? "Als Nächstes"
                  : "Heute ist noch frei"}
            </h2>
            <p>
              {todays.length
                ? `${todays.length} ${todays.length === 1 ? "Block" : "Blöcke"} · ${duration(todays.reduce((sum, t) => sum + t.minutes, 0))} eingeplant`
                : blocks.length
                  ? "Heute ist kein Block mehr offen. Hier geht es als Nächstes weiter."
                  : "Plane einen konkreten Lernschritt für eines deiner Fächer."}
            </p>
          </div>
          <button className="text-button" onClick={openPlan}>
            Zum Lernplan <ArrowRight size={15} />
          </button>
        </div>
        <div className="study-blocks">
          {blocks.map((t) => {
            const topic = data.topics.find((x) => x.id === t.topicId),
              mod = data.modules.find((m) => m.id === topic?.moduleId),
              last = latestTopicFeedback(data, t.topicId);
            return (
              <article
                key={t.id}
                className={
                  "panel study-block " +
                  (t.status === "erledigt" ? "is-done" : "")
                }
                style={{ borderLeftColor: mod?.color }}
              >
                <div className="study-block-top">
                  <span className="study-module">
                    <i
                      className="module-dot"
                      style={{ background: mod?.color }}
                    />
                    {mod?.title}
                  </span>
                  <span className="study-time">
                    <Clock3 size={14} />
                    {t.date !== today() ? dateLabel(t.date) + " · " : ""}
                    {t.time} · {duration(t.minutes)}
                  </span>
                </div>
                <h3>{short(t.title)}</h3>
                <p className="study-topic">{topic?.title}</p>
                <p className="study-goal">
                  <b>Lernziel</b> {t.goal || t.title}
                </p>
                <SourceLink task={t} />
                {last?.nextStep && (
                  <p className="study-continuation">
                    <b>Aus der letzten Rückmeldung</b>
                    {last.nextStep}
                  </p>
                )}
                {(t.instructions || t.title.length > 95) && (
                  <details className="study-details">
                    <summary>Anweisungen anzeigen</summary>
                    <p>{t.title.length > 95 ? t.title : ""}</p>
                    <p>{t.instructions}</p>
                  </details>
                )}
                <div className="study-block-actions">
                  <button
                    className="primary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          fachchatPrompt(data, t),
                        );
                        setCopied(t.id);
                        setError("");
                      } catch {
                        setError(
                          "Kopieren ist im Browser gesperrt. Öffne den Fachchat-Text unten und kopiere ihn manuell.",
                        );
                      }
                    }}
                  >
                    {copied === t.id ? (
                      <CheckCircle2 size={15} />
                    ) : (
                      <Copy size={15} />
                    )}{" "}
                    {copied === t.id ? "Kopiert" : "Für Fachchat kopieren"}
                  </button>
                  <button className="secondary" onClick={() => editTask(t)}>
                    Anpassen
                  </button>
                  <button
                    className="text-button"
                    onClick={() => editSession(t)}
                  >
                    Rückmeldung
                  </button>
                  {t.status === "erledigt" && (
                    <span className="badge gray">
                      Bearbeitet · Nachweis separat
                    </span>
                  )}
                </div>
                <details className="study-details prompt-details">
                  <summary>Fachchat-Text & IDs</summary>
                  <p className="copyable-prompt">{fachchatPrompt(data, t)}</p>
                </details>
              </article>
            );
          })}
        </div>
        {!blocks.length && (
          <div className="panel study-empty">
            <p>
              Die Erklärungen und Übungen finden in deinen Fachchats statt. Hier
              hältst du fest, was als Nächstes ansteht.
            </p>
            <button className="primary" onClick={openPlan}>
              Lernblock planen
            </button>
          </div>
        )}
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        {!!overdue.length && (
          <div className="study-conflicts">
            <b>{overdue.length} frühere Lernblöcke noch offen</b>
            <p>
              Bitte prüfen und bei Bedarf verschieben. Daraus wird kein
              fehlender Wissensnachweis abgeleitet.
            </p>
            <button className="text-button" onClick={openPlan}>
              Plan prüfen <ArrowRight size={14} />
            </button>
          </div>
        )}
      </section>
      {(!!feedbackByModule.length || !!pendingFeedback.length) && (
        <section className="panel study-feedback">
          <div className="study-section-head">
            <div>
              <h2>Nach dem Fachchat</h2>
              <p>Gespeicherter Stand und nächster Lernschritt je Fach.</p>
            </div>
          </div>
          {feedbackByModule.map(({ module: mod, feedback }) => (
            <article className="study-feedback-row" key={mod.id}>
              <span className="study-module">
                <i className="module-dot" style={{ background: mod.color }} />
                {mod.title}
              </span>
              <h3>
                {data.topics.find((t) => t.id === feedback.topicId)?.title}
              </h3>
              <p className="study-continuation">
                <b>Nächster Schritt</b>
                {feedback.nextStep ||
                  "Noch nicht festgehalten. Im Fachchat ergänzen oder zentral planen."}
              </p>
              <FeedbackDetails feedback={feedback} />
            </article>
          ))}
          {!!pendingFeedback.length && (
            <details className="study-details">
              <summary>
                Rückmeldung noch offen · {pendingFeedback.length}
              </summary>
              <p>
                Diese Blöcke sind als bearbeitet markiert, aber noch ohne
                blockbezogene Rückmeldung. Das ist keine Aussage über deinen
                Lernstand.
              </p>
              {pendingFeedback.map((t) => (
                <div className="study-pending-row" key={t.id}>
                  <span>
                    {short(t.title)} · {dateLabel(t.date)}
                  </span>
                  <button
                    className="text-button"
                    onClick={() => editSession(t)}
                  >
                    Rückmeldung ergänzen
                  </button>
                </div>
              ))}
            </details>
          )}
        </section>
      )}
      <WeekBudget data={data} editPlan={editPlan} />
    </div>
  );
}
export function TopicOverview({
  data,
  moduleId,
  search = "",
  editTopic,
  testTopic,
}: {
  data: Snapshot;
  moduleId: string;
  search?: string;
  editTopic: (t: Topic) => void;
  testTopic: (t: Topic) => void;
}) {
  const roadmap = moduleRoadmap(data, moduleId);
  const groups = [
    {
      title: "Bereits gekonnt",
      description:
        "Selbstständig bestätigt durch einen dokumentierten Test. Wiederholungen bleiben möglich.",
      topics: roadmap.confirmed,
      empty: "Noch kein selbstständiger Nachweis dokumentiert.",
    },
    {
      title: "Aktuell und als Nächstes",
      description:
        "In Bearbeitung oder als Lernblock für die nächsten zwei Wochen vorgesehen.",
      topics: roadmap.current,
      empty: "Noch kein aktueller Lernschritt festgelegt.",
    },
    {
      title: "Themenausblick bis zur Klausur",
      description: roadmap.examDate
        ? `Klausur am ${dateLabel(roadmap.examDate)} · Grobe Reihenfolge, konkrete Termine folgen schrittweise.`
        : "Klausurtermin noch offen · Grobe Reihenfolge, konkrete Termine folgen schrittweise.",
      topics: roadmap.outlook,
      empty: "Aktuell keine weiteren bekannten Themen erfasst.",
    },
  ];
  const matches = (t: Topic) =>
    t.title.toLowerCase().includes(search.toLowerCase());
  return (
    <section className="panel study-topics">
      <div className="study-section-head">
        <div>
          <h2>Themen & Lernstand</h2>
          <p>{roadmap.curriculum.description}</p>
        </div>
      </div>
      <div className="study-roadmap-summary">
        <span>{roadmap.confirmed.length} selbstständig bestätigt</span>
        <span>
          {roadmap.workedWithoutEvidence.length} bearbeitet ohne Nachweis
        </span>
        <span>{roadmap.unplannedTopicIds.length} noch ungeplant</span>
      </div>
      {groups.map((group) => (
        <section className="study-topic-group" key={group.title}>
          <h3>
            {group.title}
            <span>{group.topics.length}</span>
          </h3>
          <p className="study-muted">{group.description}</p>
          {group.topics.filter(matches).map((t) => {
            const next = data.tasks
                .filter((x) => x.topicId === t.id && x.status === "offen")
                .sort(taskOrder)[0],
              sources = topicSources(data, t.id),
              last = latestTopicFeedback(data, t.id),
              stage = topicStage(data, t),
              reasons = riskReasons(data, t);
            return (
              <article className="study-topic-row" key={t.id}>
                {(t.position || 0) > 0 && (
                  <span className="study-topic-number">{t.position}</span>
                )}
                <div className="study-topic-main">
                  <button className="row-title" onClick={() => editTopic(t)}>
                    {t.title}
                  </button>
                  <div className="study-topic-badges">
                    <span
                      className={
                        "badge " +
                        (stage === "selbstständig bestätigt" ? "green" : "gray")
                      }
                    >
                      {stage}
                    </span>
                    <span>
                      {next
                        ? `Lernblock ${dateLabel(next.date)} · ${next.time}`
                        : t.plannedStart
                          ? `Vorgesehen ${dateLabel(t.plannedStart)}${t.plannedEnd ? " – " + dateLabel(t.plannedEnd) : ""}`
                          : stage === "selbstständig bestätigt"
                            ? "Kein weiterer Block geplant"
                            : "Noch ungeplant"}
                    </span>
                  </div>
                  {!!sources.length && (
                    <div className="study-topic-sources">
                      {sources.map((s) => (
                        <SourceLink key={s.id} task={s} />
                      ))}
                    </div>
                  )}
                  {!!reasons.length && (
                    <p className="study-risk">{reasons.join(" · ")}</p>
                  )}
                  {roadmap.afterExamTopicIds.includes(t.id) && (
                    <p className="study-risk">
                      Der vorgesehene Zeitraum liegt teilweise nach der Klausur.
                      Bitte Planung prüfen.
                    </p>
                  )}
                  {last?.nextStep && (
                    <p className="study-continuation">
                      <b>Nächster Schritt</b>
                      {last.nextStep}
                    </p>
                  )}
                  {last && <FeedbackDetails feedback={last} />}
                  <details className="study-details">
                    <summary>Einordnung & Bearbeiten</summary>
                    <p>
                      Priorität {t.priority}/3 · Klausurrelevanz {t.relevance}/3
                      · Selbsteinschätzung: {t.status}
                    </p>
                    <p>
                      Thema-ID: <code>{t.id}</code>
                    </p>
                    <button
                      className="text-button"
                      onClick={() => editTopic(t)}
                    >
                      Thema & Zeitraum bearbeiten
                    </button>
                    <button
                      className="text-button"
                      onClick={() => testTopic(t)}
                    >
                      Selbsttest erfassen
                    </button>
                  </details>
                </div>
              </article>
            );
          })}
          {!group.topics.filter(matches).length && (
            <p className="study-group-empty">
              {search
                ? "Keine passenden Themen in diesem Bereich."
                : group.empty}
            </p>
          )}
        </section>
      ))}
      {roadmap.curriculum.unknownContentExpected && (
        <div className="study-unknown">
          <b>Weitere Inhalte noch unbekannt</b>
          <p>
            Neue Veranstaltungsthemen werden laufend ergänzt. Dieser Ausblick
            zeigt nur den bisher erfassten Stoff.
          </p>
        </div>
      )}
    </section>
  );
}

export function SemesterFrame({
  data,
  editTopic,
  editPlan,
}: {
  data: Snapshot;
  editPlan: (plan: Plan) => void;
  editTopic: (topic: Topic) => void;
}) {
  return (
    <section className="panel study-frame">
      <div className="study-section-head">
        <div>
          <h2>Grobplanung des Semesters</h2>
          <p>
            Themen bleiben dauerhaft erhalten. Lege für spätere Inhalte einen
            Zeitraum fest; konkrete Blöcke entstehen erst für die nächsten 14
            Tage.
          </p>
        </div>
      </div>
      {data.modules.map((m) => (
        <div key={m.id}>
          <h3>
            <i className="module-dot" style={{ background: m.color }} />
            {m.title}
          </h3>
          <p className="study-muted">{curriculumPolicy(m).description}</p>
          {data.topics
            .filter((t) => t.moduleId === m.id)
            .sort(topicOrder)
            .map((t) => (
              <button key={t.id} onClick={() => editTopic(t)}>
                <span>{t.title}</span>
                <small>
                  {t.plannedStart
                    ? `${dateLabel(t.plannedStart)}${t.plannedEnd ? " – " + dateLabel(t.plannedEnd) : ""}`
                    : "Zeitraum offen"}
                </small>
                <Pencil size={14} />
              </button>
            ))}
        </div>
      ))}
      {data.plans
        .filter(
          (p) =>
            p.startDate !== monday(p.startDate) ||
            p.endDate !== offsetDate(p.startDate, 6),
        )
        .map((p) => (
          <details className="study-details" key={p.id}>
            <summary>
              {p.title} · {dateLabel(p.startDate)} – {dateLabel(p.endDate)}
            </summary>
            <p>{p.notes}</p>
            <p>
              Zeitraumbudget: {duration(p.targetMinutes)} (kein Wochenbudget)
            </p>
            <button className="text-button" onClick={() => editPlan(p)}>
              Rahmenplan bearbeiten
            </button>
          </details>
        ))}
    </section>
  );
}

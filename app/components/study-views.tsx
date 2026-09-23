"use client";
import { materialHref } from "@/lib/client-request";
import { useEffect, useState } from "react";
import {
  Copy,
  Clock3,
  ArrowRight,
  FileText,
  Pencil,
  CheckCircle2,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  TriangleAlert,
  MessageSquareText,
  ChevronDown,
  Flag,
  Search,
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
const weekdayLabel = (date: string) =>
  new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short" }).format(
    new Date(date + "T12:00:00Z"),
  );
const duration = (minutes: number) =>
  minutes < 60
    ? `${minutes} Min.`
    : `${(minutes / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Std.`;
const short = (title: string) =>
  title.length > 95 ? title.slice(0, 92) + "…" : title;
const moduleStyle = (color?: string) => ({ "--module": color }) as React.CSSProperties;

/** The four visible learning stages, derived from existing data only. */
const stages = {
  "selbstständig bestätigt": { label: "Selbstständig bestätigt", icon: CircleCheck, className: "is-confirmed" },
  bearbeitet: { label: "Bearbeitet · Nachweis offen", icon: CircleDot, className: "is-worked" },
  "in Bearbeitung": { label: "In Bearbeitung", icon: CircleDashed, className: "is-active" },
  "noch nicht begonnen": { label: "Noch nicht begonnen", icon: Circle, className: "is-new" },
} as const;
type Stage = keyof typeof stages;
export function StageIcon({ stage, size = 18 }: { stage: Stage; size?: number }) {
  const { icon: Icon, className } = stages[stage];
  return <span className={"stage-icon " + className} aria-hidden="true"><Icon size={size} /></span>;
}

/** Confirmed and merely worked topics stay visibly distinct; only confirmed counts as progress. */
export function EvidenceBar({ total, confirmed, worked, target }: { total: number; confirmed: number; worked: number; target: number }) {
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <div className="evidence">
      <div
        className="evidence-bar"
        role="img"
        aria-label={`${confirmed} von ${total} Themen selbstständig bestätigt, ${worked} bearbeitet ohne Nachweis. Ziel ${target} Prozent.`}
      >
        <i className="seg-confirmed" style={{ width: pct(confirmed) }} />
        <i className="seg-worked" style={{ width: pct(worked) }} />
        <span className="target-mark" style={{ left: `${Math.min(100, Math.max(0, target))}%` }} title={`Ziel ${target} %`} />
      </div>
      <p className="evidence-legend">
        <span className="lg-confirmed"><CircleCheck size={14} aria-hidden="true" />{confirmed} bestätigt</span>
        <span className="lg-worked"><CircleDot size={14} aria-hidden="true" />{worked} bearbeitet</span>
        <span className="lg-total">{total} {total === 1 ? "Thema" : "Themen"}</span>
      </p>
    </div>
  );
}

function FeedbackDetails({ feedback }: { feedback: Session }) {
  return (
    <details className="inline-details">
      <summary><MessageSquareText size={14} aria-hidden="true" />Rückmeldung vom {dateLabel(feedback.date)}</summary>
      <div className="inline-details-body">
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
        <p className="muted">
          Gespeichert · Rückmeldung-ID: <code>{feedback.id}</code>
        </p>
      </div>
    </details>
  );
}
export function SourceLink({ task }: { task: Task }) {
  return task.sourceMaterialId ? (
    <a
      className="source-chip"
      href={materialHref(task.sourceMaterialId, task.sourcePageStart)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <FileText size={14} aria-hidden="true" /> Original-PDF
      {task.sourcePageStart
        ? ` · S. ${task.sourcePageStart}${task.sourcePageEnd ? "–" + task.sourcePageEnd : ""}`
        : ""}
      {task.sourceExercise ? ` · Aufgabe ${task.sourceExercise}` : ""}
    </a>
  ) : null;
}

function BudgetMeter({ budget, committed, documented, label }: { budget: number | null; committed: number; documented: number; label: string }) {
  const scale = Math.max(budget || 0, committed, 1);
  const pct = (n: number) => `${(n / scale) * 100}%`;
  const within = budget === null ? committed : Math.min(committed, budget);
  const over = budget === null ? 0 : Math.max(0, committed - budget);
  return (
    <div
      className="budget-meter"
      role="img"
      aria-label={`${label}: ${duration(documented)} dokumentiert, ${duration(committed)} verplant${budget === null ? ", kein Budget festgelegt" : `, Budget ${duration(budget)}`}${over ? `, ${over} Minuten über Budget` : ""}.`}
    >
      <i className="seg-planned" style={{ width: pct(within) }} />
      {!!over && <i className="seg-over" style={{ left: pct(budget!), width: pct(over) }} />}
      <i className="seg-documented" style={{ width: pct(Math.min(documented, committed)) }} />
      {budget !== null && <span className="budget-mark" style={{ left: pct(budget) }} />}
    </div>
  );
}

export function WeekBudget({
  data,
  start = monday(today()),
  editPlan,
  compact = false,
  showDays = true,
  openPlan,
}: {
  data: Snapshot;
  start?: string;
  editPlan?: (plan: Plan | undefined, defaults: Partial<Plan>) => void;
  compact?: boolean;
  showDays?: boolean;
  openPlan?: () => void;
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
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = offsetDate(start, i),
      tasks = data.tasks.filter((t) => t.date === date);
    return { date, tasks, minutes: tasks.reduce((sum, t) => sum + t.minutes, 0) };
  });
  const peak = Math.max(60, ...days.map((d) => d.minutes));
  const status =
    total.budget === null
      ? "Kein Wochenbudget festgelegt"
      : total.overBy
        ? `${duration(total.overBy)} über dem Budget`
        : `${duration(total.available || 0)} vom Budget frei`;
  return (
    <section className={"panel week-budget" + (compact ? " is-compact" : "")} aria-labelledby={`week-${start}`}>
      <div className="section-head">
        <div>
          <h2 id={`week-${start}`}>
            {start === monday(today()) ? "Diese Woche" : "Wochenübersicht"}{" "}
            <span>
              {dateLabel(start)} – {dateLabel(total.end)}
            </span>
          </h2>
          {!compact && <p>Budget, geplante Blöcke und tatsächlich dokumentierte Zeit.</p>}
        </div>
        {editPlan && !compact && (
          <button className="text-button" onClick={() => edit()}>
            <Pencil size={14} /> Gesamtbudget
          </button>
        )}
      </div>
      {total.budget === null && !total.committed && !total.documented ? (
        <div className="budget-empty">
          <p>Noch kein Wochenbudget und keine Lernblöcke in dieser Woche.</p>
          {editPlan && !compact ? (
            <button className="secondary compact" onClick={() => edit()}>Wochenbudget festlegen</button>
          ) : openPlan ? (
            <button className="text-button" onClick={openPlan}>Im Lernplan festlegen <ArrowRight size={14} /></button>
          ) : null}
        </div>
      ) : <>
      <div className="budget-summary">
        <p className={"budget-status" + (total.overBy ? " is-over" : "")}>
          {!!total.overBy && <TriangleAlert size={15} aria-hidden="true" />}
          {status}
        </p>
        <BudgetMeter budget={total.budget} committed={total.committed} documented={total.documented} label="Gesamtwoche" />
        <dl className="budget-figures">
          <div>
            <dt><i className="swatch documented" aria-hidden="true" />Dokumentiert</dt>
            <dd>{duration(total.documented)}</dd>
          </div>
          <div>
            <dt><i className="swatch planned" aria-hidden="true" />Geplante Blöcke</dt>
            <dd>{duration(total.planned)}</dd>
          </div>
          <div>
            <dt>Davon offen</dt>
            <dd>{duration(total.remaining)}</dd>
          </div>
          <div>
            <dt><i className="swatch budget" aria-hidden="true" />Budget</dt>
            <dd>{total.budget === null ? "offen" : duration(total.budget)}</dd>
          </div>
        </dl>
      </div>
      {showDays && <div className="week-days" aria-label="Geplante Zeit je Tag">
        {days.map(({ date, tasks, minutes }, i) => (
          <div key={date} className={"week-day" + (date === today() ? " is-today" : "")}>
            <div className="week-day-bar" aria-hidden="true">
              <i style={{ height: `${(minutes / peak) * 100}%` }} />
            </div>
            <span className="week-day-name">{["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][i]}</span>
            <b>{minutes ? duration(minutes) : "–"}</b>
            <div className="week-day-dots" aria-hidden="true">
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
        ))}
      </div>}
      </>}
      {!!warnings.length && (
        <div className="conflicts" role="status">
          <p className="conflicts-title"><TriangleAlert size={16} aria-hidden="true" />{warnings.length === 1 ? "1 Planungskonflikt" : `${warnings.length} Planungskonflikte`}</p>
          {compact ? (
            openPlan && <button className="text-button" onClick={openPlan}>Im Lernplan prüfen <ArrowRight size={14} /></button>
          ) : (
            <ul>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!compact && (
        <details className="disclosure-inner">
          <summary>Fachbudgets & Lernzeit<ChevronDown className="chevron" size={17} aria-hidden="true" /></summary>
          <div className="budget-list">
            {data.modules.map((m) => {
              const s = weekSummary(data, start, m.id);
              return (
                <div key={m.id} className="budget-row" style={moduleStyle(m.color)}>
                  <span className="budget-row-name">
                    <i className="module-dot" style={{ background: m.color }} />
                    {m.title}
                  </span>
                  <span className="budget-row-figures">
                    {duration(s.planned)} geplant · {duration(s.documented)} dokumentiert
                    {!!s.overBy && <b className="over-text"> · {s.overBy} Min. darüber</b>}
                  </span>
                  <BudgetMeter budget={s.budget} committed={s.committed} documented={s.documented} label={m.title} />
                  {editPlan ? (
                    <button className="text-button" onClick={() => edit(m.id)}>
                      {s.budget === null
                        ? "Budget festlegen"
                        : duration(s.budget) + " Budget"}
                    </button>
                  ) : (
                    <span className="muted">
                      {s.budget === null
                        ? "Budget offen"
                        : duration(s.budget) + " Budget"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="muted">
            Fachbudgets werden hier zentral verteilt. Verschiebungen ändern sie
            nicht. Ohne eindeutiges Fachbudget fordert der Fachchat eine zentrale
            Planung an.
          </p>
        </details>
      )}
    </section>
  );
}

/** Current local time in the study time zone, as HH:mm. */
const clock = () =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const span = (minutes: number) =>
  minutes < 60 ? `${minutes} Min.` : `${Math.floor(minutes / 60)} Std.${minutes % 60 ? ` ${minutes % 60} Min.` : ""}`;
type Timing = { state: "running" | "upcoming" | "past" | "later"; label: string };
/** Time context for a block. A passed time window is neutral information, not a backlog. */
function timing(t: Task, now: string): Timing {
  if (t.date !== today()) return { state: "later", label: weekdayLabel(t.date) };
  const start = toMinutes(t.time), end = start + t.minutes, current = toMinutes(now);
  if (current >= start && current < end) return { state: "running", label: `noch ${span(end - current)}` };
  if (current < start) return { state: "upcoming", label: `in ${span(start - current)}` };
  return { state: "past", label: "Zeitfenster vorbei · noch offen" };
}

function BlockCard({
  data,
  task: t,
  isNext,
  compact,
  when,
  copied,
  onCopy,
  editTask,
  editSession,
}: {
  data: Snapshot;
  task: Task;
  isNext: boolean;
  compact: boolean;
  when: Timing;
  copied: boolean;
  onCopy: () => void;
  editTask: (task: Task) => void;
  editSession: (task: Task) => void;
}) {
  const topic = data.topics.find((x) => x.id === t.topicId),
    mod = data.modules.find((m) => m.id === topic?.moduleId),
    last = latestTopicFeedback(data, t.topicId);
  const longTitle = t.title.length > 95;
  return (
    <article
      className={
        "block-card" +
        (isNext ? " is-next" : "") +
        (compact ? " is-compact" : "") +
        (when.state === "running" ? " is-running" : "") +
        (t.status === "erledigt" ? " is-done" : "")
      }
      style={moduleStyle(mod?.color)}
      aria-label={`${t.time} Uhr, ${mod?.title}: ${t.title}`}
    >
      <div className="block-time">
        {t.date !== today() && <small>{weekdayLabel(t.date)}</small>}
        <b>{t.time}</b>
        <span>{duration(t.minutes)}</span>
      </div>
      <div className="block-body">
        <div className="block-meta">
          <span className="module-label">
            <i className="module-dot" style={{ background: mod?.color }} />
            {mod?.title}
          </span>
          {isNext && <span className="badge brand">{when.state === "running" ? "Läuft jetzt" : "Als Nächstes"}</span>}
          {t.kind !== "Lernen" && <span className="kind-tag">{t.kind}</span>}
          {t.priority === 3 && <span className="meta-flag"><Flag size={13} aria-hidden="true" />Hohe Priorität</span>}
          {when.state !== "later" && <span className={"block-when is-" + when.state}><Clock3 size={13} aria-hidden="true" />{when.label}</span>}
        </div>
        <h3>{short(t.title)}</h3>
        <p className="block-topic">{topic?.title}</p>
        {compact ? (
          <div className="block-facts-inline">
            <p><span className="fact-label">Lernziel</span>{t.goal || t.title}</p>
            <p>
              <span className="fact-label">Material</span>
              {t.sourceMaterialId ? <SourceLink task={t} /> : <span className="muted">Keine Quelle verknüpft</span>}
            </p>
          </div>
        ) : (
          <div className="block-facts">
            <div className="block-goal">
              <span className="fact-label">Lernziel</span>
              <p>{t.goal || t.title}</p>
            </div>
            <div className="block-material">
              <span className="fact-label">Material</span>
              {t.sourceMaterialId ? <SourceLink task={t} /> : <p className="muted">Keine Quelle verknüpft</p>}
            </div>
          </div>
        )}
        {last?.nextStep && !compact && (
          <div className="block-continuation">
            <span className="fact-label">Aus der letzten Rückmeldung</span>
            <p>{last.nextStep}</p>
          </div>
        )}
        <div className="block-actions">
          <button className={isNext ? "primary" : "secondary compact"} onClick={onCopy}>
            {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
            {copied ? "Kopiert" : "Für Fachchat kopieren"}
          </button>
          <button className={isNext ? "secondary" : "secondary compact"} onClick={() => editTask(t)}>
            Anpassen
          </button>
          <button className="ghost" onClick={() => editSession(t)}>
            Rückmeldung erfassen
          </button>
          {t.status === "erledigt" && (
            <span className="badge gray">Bearbeitet · Nachweis separat</span>
          )}
        </div>
        <div className="block-disclosures">
          {last?.nextStep && compact && (
            <details className="inline-details">
              <summary>Aus der letzten Rückmeldung</summary>
              <div className="inline-details-body">
                <p>{last.nextStep}</p>
              </div>
            </details>
          )}
          {(t.instructions || longTitle) && (
            <details className="inline-details">
              <summary>Anweisungen anzeigen</summary>
              <div className="inline-details-body">
                {longTitle && <p>{t.title}</p>}
                {t.instructions && <p>{t.instructions}</p>}
              </div>
            </details>
          )}
          <details className="inline-details">
            <summary>Fachchat-Text & IDs</summary>
            <div className="inline-details-body">
              <p className="copyable-prompt">{fachchatPrompt(data, t)}</p>
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}

export function TodayView({
  data,
  editTask,
  editSession,
  openPlan,
  editPlan,
  create,
}: {
  data: Snapshot;
  editTask: (task: Task) => void;
  editSession: (task: Task) => void;
  openPlan: () => void;
  editPlan: (plan: Plan | undefined, defaults: Partial<Plan>) => void;
  create?: (entity: "modules" | "topics" | "tasks") => void;
}) {
  const [copied, setCopied] = useState(""),
    [error, setError] = useState(""),
    [now, setNow] = useState(clock);
  useEffect(() => {
    const timer = setInterval(() => setNow(clock()), 30_000);
    return () => clearInterval(timer);
  }, []);
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
  const doneToday = data.tasks.filter((t) => t.date === today() && t.status === "erledigt").length;
  // The next block is the first open one whose time window has not ended yet.
  const nextId = (
    blocks.find((t) => t.status === "offen" && timing(t, now).state !== "past") ||
    blocks.find((t) => t.status === "offen")
  )?.id;
  return (
    <div className="today-layout">
      <section className="today-main" aria-labelledby="today-blocks">
        <div className="section-head">
          <div>
            <h2 id="today-blocks">
              {todays.length
                ? "Deine Lernblöcke heute"
                : blocks.length
                  ? "Als Nächstes"
                  : "Heute ist noch frei"}
            </h2>
            <p>
              {todays.length
                ? `${todays.length} ${todays.length === 1 ? "Block" : "Blöcke"} offen · ${duration(todays.reduce((sum, t) => sum + t.minutes, 0))} eingeplant${doneToday ? ` · ${doneToday} bereits bearbeitet` : ""}`
                : blocks.length
                  ? "Heute ist kein Block mehr offen. Hier geht es als Nächstes weiter."
                  : "Plane einen konkreten Lernschritt für eines deiner Fächer."}
            </p>
          </div>
          <button className="text-button" onClick={openPlan}>
            Zum Lernplan <ArrowRight size={15} />
          </button>
        </div>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <div className="block-list">
          {blocks.map((t) => (
            <BlockCard
              key={t.id}
              data={data}
              task={t}
              isNext={t.id === nextId}
              compact={t.id !== nextId}
              when={timing(t, now)}
              copied={copied === t.id}
              editTask={editTask}
              editSession={editSession}
              onCopy={async () => {
                try {
                  await navigator.clipboard.writeText(fachchatPrompt(data, t));
                  setCopied(t.id);
                  setError("");
                } catch {
                  setError(
                    "Kopieren ist im Browser gesperrt. Öffne „Fachchat-Text & IDs“ und kopiere ihn manuell.",
                  );
                }
              }}
            />
          ))}
        </div>
        {!blocks.length && (!data.modules.length || !data.topics.length) && create && (
          <section className="panel setup-guide" aria-labelledby="setup-heading">
            <h3 id="setup-heading">So startet dein Semester</h3>
            <p className="muted">Drei Schritte, dann steht hier jeden Tag dein nächster Lernblock. Du kannst die Einrichtung auch deinem Fachchat übertragen.</p>
            <ol>
              {[
                { done: !!data.modules.length, title: "Modul anlegen", text: "Fach, Kürzel, Klausurtermin und Lernziel.", action: () => create("modules"), label: "Modul anlegen" },
                { done: !!data.topics.length, title: "Themen ergänzen", text: "Die Stoffübersicht, aus der später Lernblöcke entstehen.", action: () => create("topics"), label: "Thema anlegen" },
                { done: !!data.tasks.length, title: "Ersten Lernblock planen", text: "Konkretes Ziel, Dauer und passende Unterlagen.", action: () => create("tasks"), label: "Lernblock planen" },
              ].map((step, i, all) => {
                const current = !step.done && all.slice(0, i).every((x) => x.done);
                return (
                  <li key={step.title} className={step.done ? "is-done" : current ? "is-current" : ""}>
                    <span className="setup-step" aria-hidden="true">{step.done ? <CircleCheck size={18} /> : i + 1}</span>
                    <div>
                      <b>{step.title}{step.done && <span className="visually-hidden"> (erledigt)</span>}</b>
                      <p>{step.text}</p>
                    </div>
                    {current && <button className="primary compact" onClick={step.action}>{step.label}</button>}
                  </li>
                );
              })}
            </ol>
          </section>
        )}
        {!blocks.length && !!data.modules.length && !!data.topics.length && (
          <div className="panel empty-state">
            <span className="empty-icon" aria-hidden="true"><Clock3 size={22} /></span>
            <p>
              Die Erklärungen und Übungen finden in deinen Fachchats statt. Hier
              hältst du fest, was als Nächstes ansteht.
            </p>
            <button className="primary" onClick={create ? () => create("tasks") : openPlan}>
              Lernblock planen
            </button>
          </div>
        )}
        {!!overdue.length && (
          <div className="notice warn">
            <TriangleAlert size={18} aria-hidden="true" />
            <div>
              <b>{overdue.length === 1 ? "1 früherer Lernblock ist noch offen" : `${overdue.length} frühere Lernblöcke sind noch offen`}</b>
              <p>
                Bitte prüfen und bei Bedarf verschieben. Daraus wird kein
                fehlender Wissensnachweis abgeleitet.
              </p>
            </div>
            <button className="text-button" onClick={openPlan}>
              Plan prüfen <ArrowRight size={14} />
            </button>
          </div>
        )}
      </section>
      <aside className="today-aside" aria-label="Woche und Rückmeldungen">
        <WeekBudget data={data} editPlan={editPlan} compact openPlan={openPlan} />
        {(!!feedbackByModule.length || !!pendingFeedback.length) && (
          <section className="panel feedback-panel" aria-labelledby="after-chat">
            <div className="section-head">
              <div>
                <h2 id="after-chat">Nach dem Fachchat</h2>
                <p>Letzte Rückmeldung und nächster Schritt je Fach.</p>
              </div>
            </div>
            {feedbackByModule.map(({ module: mod, feedback }) => (
              <article className="feedback-row" key={mod.id} style={moduleStyle(mod.color)}>
                <span className="module-label">
                  <i className="module-dot" style={{ background: mod.color }} />
                  {mod.title}
                </span>
                <h3>
                  {data.topics.find((t) => t.id === feedback.topicId)?.title}
                </h3>
                <p className={feedback.nextStep ? "next-step" : "next-step muted"}>
                  <span className="fact-label">Nächster Schritt</span>
                  {feedback.nextStep ||
                    "Noch nicht festgehalten. Im Fachchat ergänzen oder zentral planen."}
                </p>
                <FeedbackDetails feedback={feedback} />
              </article>
            ))}
            {!!pendingFeedback.length && (
              <details className="inline-details pending">
                <summary>
                  Rückmeldung noch offen · {pendingFeedback.length}
                </summary>
                <div className="inline-details-body">
                  <p className="muted">
                    Diese Blöcke sind als bearbeitet markiert, aber noch ohne
                    blockbezogene Rückmeldung. Das ist keine Aussage über deinen
                    Lernstand.
                  </p>
                  {pendingFeedback.map((t) => (
                    <div className="pending-row" key={t.id}>
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
                </div>
              </details>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}

export function TopicOverview({
  data,
  moduleId,
  search = "",
  setSearch,
  editTopic,
  testTopic,
  addTopic,
}: {
  data: Snapshot;
  moduleId: string;
  search?: string;
  setSearch?: (value: string) => void;
  addTopic?: () => void;
  editTopic: (t: Topic) => void;
  testTopic: (t: Topic) => void;
}) {
  const roadmap = moduleRoadmap(data, moduleId);
  const groups = [
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
        ? `Klausur am ${dateLabel(roadmap.examDate)}. Grobe Reihenfolge, konkrete Termine folgen schrittweise.`
        : "Klausurtermin noch offen. Grobe Reihenfolge, konkrete Termine folgen schrittweise.",
      topics: roadmap.outlook,
      empty: "Aktuell keine weiteren bekannten Themen erfasst.",
    },
    {
      title: "Bereits gekonnt",
      description:
        "Selbstständig bestätigt durch einen dokumentierten Test. Wiederholungen bleiben möglich.",
      topics: roadmap.confirmed,
      empty: "Noch kein selbstständiger Nachweis dokumentiert.",
    },
  ];
  const matches = (t: Topic) =>
    t.title.toLowerCase().includes(search.toLowerCase());
  return (
    <section className="panel topics-panel" aria-labelledby="topics-heading">
      <div className="section-head">
        <div>
          <h3 id="topics-heading">Themen & Lernstand</h3>
          <p>{roadmap.curriculum.description}</p>
        </div>
      </div>
      {setSearch && data.topics.some((t) => t.moduleId === moduleId) && (
        <div className="search-field">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            aria-label="Themen in diesem Modul suchen"
            placeholder="Thema suchen …"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}
      {!data.topics.some((t) => t.moduleId === moduleId) ? (
        <div className="empty-state compact-empty">
          <span className="empty-icon" aria-hidden="true"><Circle size={22} /></span>
          <p>Noch keine Themen. Lege die Stoffübersicht an – daraus entstehen später konkrete Lernblöcke.</p>
          {addTopic && <button className="primary compact" onClick={addTopic}>Erstes Thema anlegen</button>}
        </div>
      ) : <>
      <ul className="stage-legend" aria-label="Legende Lernstand">
        {(Object.keys(stages) as Stage[]).map((s) => (
          <li key={s}><StageIcon stage={s} size={15} />{stages[s].label}</li>
        ))}
      </ul>
      {groups.map((group) => (
        <section className="topic-group" key={group.title}>
          <h4>
            {group.title}
            <span className="count">{group.topics.length}</span>
          </h4>
          <p className="muted">{group.description}</p>
          <ul className="topic-list">
          {group.topics.filter(matches).map((t) => {
            const next = data.tasks
                .filter((x) => x.topicId === t.id && x.status === "offen")
                .sort(taskOrder)[0],
              sources = topicSources(data, t.id),
              last = latestTopicFeedback(data, t.id),
              stage = topicStage(data, t) as Stage,
              reasons = riskReasons(data, t);
            const afterExam = roadmap.afterExamTopicIds.includes(t.id);
            return (
              <li className="topic-row" key={t.id}>
                <StageIcon stage={stage} />
                <div className="topic-main">
                  <div className="topic-title-line">
                    {(t.position || 0) > 0 && (
                      <span className="topic-number">{t.position}.</span>
                    )}
                    <button className="row-title" onClick={() => editTopic(t)}>
                      {t.title}
                    </button>
                  </div>
                  <p className="topic-meta">
                    <span className={"stage-text " + stages[stage].className}>{stages[stage].label}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {next
                        ? `Lernblock ${weekdayLabel(next.date)}, ${next.time}`
                        : t.plannedStart
                          ? `Vorgesehen ${dateLabel(t.plannedStart)}${t.plannedEnd ? " – " + dateLabel(t.plannedEnd) : ""}`
                          : stage === "selbstständig bestätigt"
                            ? "Kein weiterer Block geplant"
                            : "Noch ungeplant"}
                    </span>
                  </p>
                  {!!sources.length && (
                    <div className="topic-sources">
                      {sources.map((s) => (
                        <SourceLink key={s.id} task={s} />
                      ))}
                    </div>
                  )}
                  {(!!reasons.length || afterExam) && (
                    <p className="risk-text">
                      <TriangleAlert size={14} aria-hidden="true" />
                      {[...reasons, ...(afterExam ? ["Zeitraum liegt teilweise nach der Klausur; bitte Planung prüfen"] : [])].join(" · ")}
                    </p>
                  )}
                  {last?.nextStep && (
                    <p className="next-step">
                      <span className="fact-label">Nächster Schritt</span>
                      {last.nextStep}
                    </p>
                  )}
                  <div className="topic-actions">
                    <button className="text-button" onClick={() => testTopic(t)}>
                      Selbsttest erfassen
                    </button>
                    <button className="text-button" onClick={() => editTopic(t)}>
                      Thema & Zeitraum bearbeiten
                    </button>
                  </div>
                  <div className="topic-disclosures">
                    {last && <FeedbackDetails feedback={last} />}
                    <details className="inline-details">
                      <summary>Einordnung & ID</summary>
                      <div className="inline-details-body">
                        <p>
                          Priorität {t.priority}/3 · Klausurrelevanz {t.relevance}/3
                          · Selbsteinschätzung: {t.status}
                        </p>
                        <p>
                          Thema-ID: <code>{t.id}</code>
                        </p>
                      </div>
                    </details>
                  </div>
                </div>
              </li>
            );
          })}
          </ul>
          {!group.topics.filter(matches).length && (
            <p className="group-empty">
              {search
                ? "Keine passenden Themen in diesem Bereich."
                : group.empty}
            </p>
          )}
        </section>
      ))}
      </>}
      {roadmap.curriculum.unknownContentExpected && (
        <div className="notice neutral">
          <CircleDashed size={18} aria-hidden="true" />
          <div>
            <b>Weitere Inhalte noch unbekannt</b>
            <p>
              Neue Veranstaltungsthemen werden laufend ergänzt. Dieser Ausblick
              zeigt nur den bisher erfassten Stoff.
            </p>
          </div>
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
  const now = today();
  const known = [
    now,
    ...data.topics.flatMap((t) => [t.plannedStart, t.plannedEnd]),
    ...data.modules.map((m) => m.examDate),
  ].filter((d): d is string => !!d).sort();
  const first = known[0], last = known[known.length - 1] > offsetDate(now, 14) ? known[known.length - 1] : offsetDate(now, 14);
  const rangeStart = offsetDate(first, -3), rangeEnd = offsetDate(last, 3);
  const span = (Date.parse(rangeEnd) - Date.parse(rangeStart)) / 86400000;
  const at = (d: string) => `${Math.min(100, Math.max(0, ((Date.parse(d) - Date.parse(rangeStart)) / 86400000 / span) * 100))}%`;
  const months: string[] = [];
  for (let d = new Date(rangeStart + "T12:00:00Z"); d.toISOString().slice(0, 10) <= rangeEnd; d.setUTCMonth(d.getUTCMonth() + 1, 1)) {
    const iso = d.toISOString().slice(0, 7) + "-01";
    if (iso >= rangeStart) months.push(iso);
  }
  const frames = data.plans.filter(
    (p) =>
      p.startDate !== monday(p.startDate) ||
      p.endDate !== offsetDate(p.startDate, 6),
  );
  return (
    <section className="panel semester-frame" aria-labelledby="semester-heading">
      <div className="section-head">
        <div>
          <h2 id="semester-heading">Grobplanung des Semesters</h2>
          <p>
            Themen bleiben dauerhaft erhalten. Spätere Inhalte bekommen einen
            Zeitraum; konkrete Blöcke entstehen erst für die nächsten 14 Tage.
          </p>
        </div>
      </div>
      <div className="timeline" style={{ "--today": at(now) } as React.CSSProperties}>
        <div className="timeline-scale" aria-hidden="true">
          <span className="timeline-label-col" />
          <div className="timeline-track">
            {months.map((mo) => (
              <span key={mo} style={{ left: at(mo) }}>
                {new Intl.DateTimeFormat("de-DE", { month: "short" }).format(new Date(mo + "T12:00:00Z"))}
              </span>
            ))}
            <span className="timeline-today-label" style={{ left: at(now) }}>Heute</span>
          </div>
        </div>
        {data.modules.map((m) => {
          const topics = data.topics.filter((t) => t.moduleId === m.id).sort(topicOrder);
          return (
            <div className="timeline-module" key={m.id} style={moduleStyle(m.color)}>
              <div className="timeline-module-head">
                <h3>
                  <i className="module-dot" style={{ background: m.color }} />
                  {m.title}
                </h3>
                <span className="muted">{m.examDate ? `Klausur ${dateLabel(m.examDate)}` : "Klausurtermin offen"}</span>
              </div>
              <p className="muted timeline-policy">{curriculumPolicy(m).description}</p>
              {!topics.length && <p className="group-empty">Noch keine Themen erfasst.</p>}
              {topics.map((t) => {
                const stage = topicStage(data, t) as Stage;
                const end = t.plannedEnd || (t.plannedStart ? offsetDate(t.plannedStart, 6) : null);
                return (
                  <button key={t.id} className="timeline-row" title={`${t.title} – ${stages[stage].label}`} onClick={() => editTopic(t)}>
                    <span className="timeline-label-col">
                      <StageIcon stage={stage} size={15} />
                      <span className="timeline-topic">{t.title}</span>
                      <small>
                        {t.plannedStart
                          ? `${dateLabel(t.plannedStart)}${t.plannedEnd ? " – " + dateLabel(t.plannedEnd) : ""}`
                          : "Zeitraum offen"}
                      </small>
                    </span>
                    <span className="timeline-track" aria-hidden="true">
                      {t.plannedStart && end ? (
                        <i className={"timeline-bar " + stages[stage].className} style={{ left: at(t.plannedStart), width: `calc(${at(end)} - ${at(t.plannedStart)})` }} />
                      ) : (
                        <em className="timeline-open">Zeitraum offen</em>
                      )}
                      {m.examDate && <span className="timeline-exam" style={{ left: at(m.examDate) }} />}
                    </span>
                    <Pencil size={14} className="timeline-edit" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          );
        })}
        <p className="timeline-legend muted">
          <span><i className="legend-today" />Heute</span>
          <span><i className="legend-exam" />Klausur</span>
          <span>Balken: vorgesehener Themenzeitraum</span>
        </p>
      </div>
      {!!frames.length && (
        <div className="frame-plans">
          <h3>Rahmenpläne</h3>
          {frames.map((p) => (
            <details className="inline-details" key={p.id}>
              <summary>
                {p.title} · {dateLabel(p.startDate)} – {dateLabel(p.endDate)}
              </summary>
              <div className="inline-details-body">
                {p.notes && <p>{p.notes}</p>}
                <p>
                  Zeitraumbudget: {duration(p.targetMinutes)} (kein Wochenbudget)
                </p>
                <button className="text-button" onClick={() => editPlan(p)}>
                  Rahmenplan bearbeiten
                </button>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

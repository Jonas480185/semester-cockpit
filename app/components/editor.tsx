"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { TaskSourceFields, emptySource, type TaskSource } from "./task-source";
import { type Snapshot, type Entity, today, offsetDate } from "@/lib/model";
export type EditValues = TaskSource & { id?: string } & Record<string, string | number | boolean | null | undefined>;
export type Edit = {
  entity: Exclude<Entity, "history">;
  value?: EditValues;
  defaults?: EditValues;
  revision?: number;
};
const labels: Record<string, string> = {
  title: "Kurzer Titel",
  goal: "Konkretes Lernziel",
  instructions: "Weitere Anweisungen (optional)",
  position: "Reihenfolge (0 = nicht festgelegt)",
  plannedStart: "Themenzeitraum ab (optional)",
  plannedEnd: "Themenzeitraum bis (optional)",
  taskId: "Zugehöriger Lernblock (optional)",
  assistance: "Selbstständig oder mit Hilfe?",
  difficulty: "Offene Schwierigkeit (optional)",
  nextStep: "Nächster Schritt (optional)",
  code: "Kürzel",
  color: "Modulfarbe",
  credits: "ECTS",
  examDate: "Klausurdatum (optional)",
  target: "Ziel für nachgewiesene Beherrschung (%)",
  moduleId: "Modul",
  topicId: "Thema",
  status: "Status",
  priority: "Priorität",
  relevance: "Klausurrelevanz",
  lastPracticed: "Zuletzt geübt",
  date: "Datum",
  time: "Uhrzeit",
  minutes: "Dauer (Minuten)",
  kind: "Art",
  score: "Ergebnis (%)",
  independent: "Selbstständig und ohne Hilfe gelöst",
  notes: "Notizen",
  learningNotes: "Lernnotiz – Regeln und Beobachtungen (optional)",
  description: "Fehler oder Wissenslücke",
  interval: "Nächster Abstand (Tage)",
  startDate: "Beginn",
  endDate: "Ende",
  targetMinutes: "Festes Zeitbudget (Minuten)",
};
const names: Record<string, string> = {
  modules: "Modul",
  topics: "Thema",
  tasks: "Lernaufgabe",
  tests: "Selbsttest",
  gaps: "Wissenslücke",
  sessions: "Lernzeit",
  reviews: "Wiederholung",
  deadlines: "Termin",
  plans: "Lernplan",
};
function defaults(e: string, data: Snapshot): EditValues {
  const topicId = data.topics[0]?.id || "",
    moduleId = data.modules[0]?.id || "",
    date = today();
  return (
    {
      modules: {
        title: "",
        code: "",
        color: "#6955d8",
        credits: 5,
        examDate: null,
        target: 60,
        learningNotes: "",
      },
      topics: {
        moduleId,
        title: "",
        status: "nicht begonnen",
        priority: 2,
        relevance: 2,
        lastPracticed: null,
        position: 0, plannedStart: null, plannedEnd: null,
      },
      tasks: {
        ...emptySource,
        goal: "", instructions: "",
        topicId,
        title: "",
        date,
        time: "09:00",
        minutes: 45,
        status: "offen",
        kind: "Lernen",
        priority: 2,
      },
      tests: {
        topicId,
        date: new Date().toISOString(),
        score: 0,
        independent: false,
        notes: "",
      },
      gaps: { topicId, description: "", status: "offen", date },
      sessions: { topicId, taskId: null, date, minutes: 0, notes: "", assistance: "unbekannt", difficulty: "", nextStep: "" },
      reviews: { topicId, date, status: "offen", interval: 7 },
      deadlines: { moduleId, title: "", date, kind: "Klausur" },
      plans: {
        moduleId: null,
        startDate: date,
        endDate: date,
        title: "",
        notes: "",
        targetMinutes: 900,
      },
    } as Record<string, EditValues>
  )[e];
}
export function Modal({
  title,
  children,
  onClose,
  closeDisabled = false,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!closeDisabled) onClose();
      }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (!closeDisabled && e.target === e.currentTarget && (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          type="button"
          aria-label="Schließen"
          disabled={closeDisabled}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Editor({
  edit,
  data,
  onClose,
  onSave,
  busy,
}: {
  edit: Edit;
  data: Snapshot;
  onClose: () => void;
  onSave: (value: EditValues, reason?: string) => Promise<void>;
  busy: boolean;
}) {
  const [v, setV] = useState<EditValues>(() => {
    const initial: EditValues = {
      ...defaults(edit.entity, data),
      ...edit.defaults,
      ...edit.value,
    };
    if (edit.entity === "tests") {
      const d = new Date(String(initial.date));
      initial.date = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 19);
    }
    return initial;
  });
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const e = edit.entity;
  const planChanged = !!edit.value && (["plans", "topics"].includes(e) || (e === "tasks" && ["date", "time", "minutes"].some(k => v[k] !== edit.value?.[k])));
  const opts: Record<string, [string | number, string][]> = {
    moduleId: [...(e === "plans" ? [["", "Gesamtbudget / zentrale Semesterplanung"] as [string, string]] : []), ...data.modules.map((m): [string, string] => [m.id, m.title])],
    taskId: [["", "Kein Lernblock"], ...data.tasks.filter(t=>t.topicId===v.topicId).map((t): [string, string] => [t.id, `${t.date} · ${t.title}`])],
    assistance: ["unbekannt", "selbstständig", "mit Hilfe"].map(v=>[v,v]),
    topicId: data.topics.map((t) => [
      t.id,
      (data.modules.find((m) => m.id === t.moduleId)?.code || "") +
        " · " +
        t.title,
    ]),
    priority: [
      [1, "Niedrig"],
      [2, "Mittel"],
      [3, "Hoch"],
    ],
    relevance: [
      [1, "Gering"],
      [2, "Mittel"],
      [3, "Hoch"],
    ],
    status: (e === "topics"
      ? ["nicht begonnen", "unsicher", "in Arbeit", "sicher"]
      : e === "gaps"
        ? ["offen", "geschlossen"]
        : ["offen", "erledigt"]
    ).map((v) => [v, v]),
    kind: (e === "deadlines"
      ? ["Klausur", "Abgabe"]
      : ["Lernen", "Wiederholung", "Selbsttest"]
    ).map((v) => [v, v]),
  };
  return (
    <Modal
      title={`${names[e]} ${edit.value ? "bearbeiten" : "erfassen"}`}
      onClose={onClose}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            const value = { ...v };
            if (e === "tests") value.date = new Date(String(value.date)).toISOString();
            await onSave(value, reason.trim() || (edit.value ? "Metadaten aktualisiert" : "Manuell ergänzt"));
          } catch (err) {
            setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
          }
        }}
      >
        <div className="form-fields">
          {Object.entries(v)
            .filter(([k]) => k !== "id" && k !== "recordedAt" && !Object.keys(emptySource).includes(k))
            .map(([k, val]) => (
              <label
                key={k}
                className={
                  [
                    "notes",
                    "learningNotes",
                    "goal", "instructions", "difficulty", "nextStep",
                    "description",
                    "title",
                    "topicId",
                    "moduleId",
                    "independent",
                  ].includes(k)
                    ? "wide"
                    : ""
                }
              >
                {k === "independent" ? (
                  <span className="check-label">
                    <input
                      type="checkbox"
                      checked={!!val}
                      onChange={(ev) => setV({ ...v, [k]: ev.target.checked })}
                    />
                    {labels[k]}
                  </span>
                ) : (
                  <>
                    <span>{labels[k] || k}</span>
                    {opts[k] ? (
                      <select
                        required={!["taskId", ...(e==="plans"?["moduleId"]:[])].includes(k)}
                        value={String(val ?? "")}
                        onChange={(ev) =>
                          setV({
                            ...v,
                            ...(e === "sessions" && k === "topicId" ? {taskId: null} : {}),
                            ...(e === "tasks" && k === "topicId" && data.topics.find(t => t.id === v.topicId)?.moduleId !== data.topics.find(t => t.id === ev.target.value)?.moduleId ? emptySource : {}),
                            [k]: ["priority", "relevance"].includes(k)
                              ? Number(ev.target.value)
                              : ["taskId", ...(e === "plans" ? ["moduleId"] : [])].includes(k) && !ev.target.value ? null : ev.target.value,
                          })
                        }
                      >
                        {opts[k].map(([value, label]) => (
                          <option value={value} key={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : ["notes", "description", "learningNotes", "instructions", "difficulty", "nextStep"].includes(k) ? (
                      <textarea
                        maxLength={k === "description" ? 300 : ["difficulty", "nextStep"].includes(k) ? 1000 : 5000}
                        rows={3}
                        required={k === "description"}
                        value={val as string}
                        onChange={(ev) => setV({ ...v, [k]: ev.target.value })}
                      />
                    ) : (
                      <input
                        required={!["notes", "lastPracticed", "examDate", "plannedStart", "plannedEnd", "goal"].includes(k)}
                        type={
                          k === "color"
                            ? "color"
                            : k === "time"
                              ? "time"
                              : k === "date" && e === "tests"
                                ? "datetime-local"
                                : /date/i.test(k) || ["lastPracticed", "plannedStart", "plannedEnd"].includes(k)
                                  ? "date"
                                  : typeof val === "number"
                                    ? "number"
                                    : "text"
                        }
                        min={
                          ["score", "target", "targetMinutes", "position", ...(e === "sessions" ? ["minutes"] : [])].includes(k)
                            ? 0
                            : typeof val === "number"
                              ? 1
                              : undefined
                        }
                        step={k === "date" && e === "tests" ? 1 : undefined}
                        max={
                          ["score", "target"].includes(k)
                            ? 100
                            : k === "minutes"
                              ? 720
                              : k === "credits"
                                ? 30
                                : k === "interval"
                                  ? 365
                                  : k === "date" && e === "tasks" ? (String(edit.value?.date || "") > offsetDate(today(), 13) ? String(edit.value?.date) : offsetDate(today(), 13)) : k === "date" && e === "sessions"
                                    ? today()
                                    : undefined
                        }
                        maxLength={k === "code" ? 6 : 300}
                        value={
                          val == null
                            ? ""
                            : k === "date" && e !== "tests"
                              ? String(val).slice(0, 10)
                              : String(val)
                        }
                        onChange={(ev) =>
                          setV({
                            ...v,
                            [k]:
                              typeof val === "number"
                                ? Number(ev.target.value)
                                : ["lastPracticed", "examDate", "plannedStart", "plannedEnd"].includes(k) && !ev.target.value
                                  ? null
                                  : ev.target.value,
                          })
                        }
                      />
                    )}
                  </>
                )}
              </label>
            ))}
        </div>
        {e === "tasks" && <TaskSourceFields moduleId={data.topics.find(t => t.id === v.topicId)?.moduleId} value={v} onChange={patch => setV({ ...v, ...patch })} />}
        {e === "tests" && (
          <p className="form-hint">
            Ein Ergebnis ab 80 % ohne Hilfe ist ein Nachweis. Den Themenstatus
            kannst du anschließend auf „sicher“ setzen.
          </p>
        )}
        {planChanged && <label className="study-reason">Kurzer Grund für die Planänderung<input required maxLength={300} value={reason} onChange={ev=>setReason(ev.target.value)} placeholder="z. B. Übung braucht mehr Zeit"/></label>}
        {e === "sessions" && <p className="form-hint">0 Minuten = Zeit unbekannt. Eine Rückmeldung belegt keine vollständige Beherrschung.</p>}
        {e === "tasks" && <p className="form-hint">Neue Termine nur für die nächsten 14 Tage. Verschieben erhält Thema, Quellen und Ergebnisse. Das Wochenbudget bleibt unverändert.</p>}
        {e === "plans" && <p className="form-hint">Wochenbudgets gelten Montag bis Sonntag. Ein Fachbudget ist ein Anteil am Gesamtbudget. Längere Pläne bleiben als grober Rahmen erhalten.</p>}
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Abbrechen
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Speichert …" : "Speichern"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

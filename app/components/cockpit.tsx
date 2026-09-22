"use client";
import Image from "next/image";
import { clientRequest, materialHref } from "@/lib/client-request";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  ListTodo,
  Repeat2,
  ChartNoAxesCombined,
  Plug,
  ArrowUpRight,
  Plus,
  ArrowRight,
  Clock3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Command,
  TriangleAlert,
  Search,
  Target,
  CheckCircle2,
  Pencil,
  RefreshCw,
  Download,
  KeyRound,
  Copy,
  ExternalLink,
  X,
  History,
} from "lucide-react";
import {
  type Snapshot,
  type Task,
  progress,
  mastered,
  risks,
  today,
  monday,
  offsetDate,
} from "@/lib/model";
import { TodayView, WeekBudget, TopicOverview, SemesterFrame } from "./study-views";
import { proposeWeek } from "@/lib/planner";
import { Editor, Modal, type Edit, type EditValues } from "./editor";
import { MaterialsPanel } from "./materials";
import { batchInput } from "@/lib/openapi";
import { batchSchema, type Operation } from "@/lib/validation";
const fmt = (
  d: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) =>
  new Intl.DateTimeFormat("de-DE", options).format(
    new Date(d.slice(0, 10) + "T12:00:00Z"),
  );
const hours = (n: number) =>
  (n / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 });
const links = [
  { icon: LayoutDashboard, label: "Heute" },
  { icon: BookOpen, label: "Module" },
  { icon: CalendarDays, label: "Lernplan" },
  { icon: ListTodo, label: "Aufgaben" },
  { icon: Repeat2, label: "Wiederholungen" },
  { icon: ChartNoAxesCombined, label: "Wissensstand" },
  { icon: CalendarDays, label: "Termine" },
];
type AgentKey = { id: string; name: string; scope: string; expiresAt: string; revoked: number };
type AuditEntry = { id: string; date: string; actor: string; entity: string; action: string; reason?: string; before: string | null; after: string | null; revision: number };
type SnapshotResponse = { data: Snapshot; revision: number };
type BrowserTool = { name: string; description: string; inputSchema: object; annotations: Record<string, boolean>; execute: (input: unknown) => Promise<unknown> };
type BrowserModelContext = { registerTool: (tool: BrowserTool, options: { signal: AbortSignal }) => unknown };
function currentView() {
  const raw = new URLSearchParams(location.search).get("view");
  const view = raw === "Übersicht" ? "Heute" : raw;
  return view && [...links.map(link => link.label), "Agent & API"].includes(view) ? view : "Heute";
}
function subscribeView(listener: () => void) {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}
const initialView = () => "Heute";
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Die Änderung konnte nicht gespeichert werden.";
async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const r = await clientRequest(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (r.status === 401)
    throw new Error("Bitte neu anmelden, um deine Daten zu laden.");
  let value: unknown;
  try {
    value = await r.json();
  } catch {
    throw new Error("Der Server ist nicht erreichbar. Bitte erneut versuchen.");
  }
  if (!r.ok) {
    const detail = value && typeof value === "object" && "error" in value ? value.error : undefined;
    throw new Error(typeof detail === "string" ? detail : "Die Änderung konnte nicht gespeichert werden.");
  }
  return value as T;
}
export default function Cockpit({ demo = false }: { demo?: boolean }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [revision, setRevision] = useState(0);
  const view = useSyncExternalStore(subscribeView, currentView, initialView);
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [knowledgeTab, setKnowledgeTab] = useState("Wissenslücken");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("offen");
  const [week, setWeek] = useState(monday(today()));
  const [planView, setPlanView] = useState("Woche");
  const [selectedDate, setSelectedDate] = useState(today());
  const [proposal, setProposal] = useState<
    (ReturnType<typeof proposeWeek> & { revision: number }) | null
  >(null);
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [keyName, setKeyName] = useState("Mein Lernagent");
  const [keyScope, setKeyScope] = useState("read-write");
  const [secret, setSecret] = useState("");
  const snapshotRef = useRef({ data, revision });
  const lock = useRef(false);
  const refresh = useCallback(async () => {
    const snap = await api<SnapshotResponse>("/api/v1/snapshot");
    setData(snap.data);
    setRevision(snap.revision);
    snapshotRef.current = snap;
    return snap;
  }, []);
  useEffect(() => {
    let live = true;
    api("/api/setup", { method: "POST" })
      .then(async () => { if (live) await refresh(); })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [refresh]);
  const hasData = data !== null;
  useEffect(() => {
    if (view === "Agent & API" && hasData)
      Promise.all([api<{ data: AgentKey[] }>("/api/v1/keys"), api<{ data: AuditEntry[] }>("/api/v1/audit")])
        .then(([k, a]) => {
          setKeys(k.data);
          setAudit(a.data);
        })
        .catch((e) => setError(e.message));
  }, [view, revision, hasData]);
  useEffect(() => {
    if (view === "Lernplan" && hasData) api<{ data: AuditEntry[] }>("/api/v1/audit").then(a => setAudit(a.data)).catch(e => setError(e.message));
  }, [view, revision, hasData]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const onFocus = () => {
      if (!lock.current) refresh().catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") onFocus();
    }, 15000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(poll);
    };
  }, [refresh]);
  const navigate = (v: string) => {
    setSearch("");
    setModuleId(null);
    history.pushState(null, "", "?view=" + encodeURIComponent(v));
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const write = useCallback(
    async (
      operations: Operation[],
      message = "Gespeichert.",
      expectedRevision?: number,
      idempotencyKey?: string,
      reason?: string,
      moduleScope?: string,
    ) => {
      if (lock.current) throw new Error("Ein Speichervorgang läuft bereits.");
      lock.current = true;
      setBusy(true);
      setError("");
      try {
        const result = await api<{ planningWarnings?: string[] }>("/api/v1/batch", {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey || crypto.randomUUID() },
          body: JSON.stringify({
            revision: expectedRevision ?? snapshotRef.current.revision,
            operations,
            ...(reason ? { reason } : {}),
            ...(moduleScope ? { moduleScope } : {}),
          }),
        });
        await refresh();
        setToast(result.planningWarnings?.length ? message + " Budget- oder Zeitkonflikt: Details im Lernplan." : message);
        return result;
      } catch (e) {
        setError(errorMessage(e));
        await refresh().catch(() => {});
        throw e;
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [refresh],
  );
  const safeWrite = (ops: Operation[], message?: string) => {
    void write(ops, message).catch(() => {});
  };
  useEffect(() => {
    if (demo) return;
    const context = (document as Document & { modelContext?: BrowserModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: BrowserTool) => {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    };
    register({
      name: "semester_read",
      description:
        "Read current semester data from the database, including revision.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input: unknown) => {
        if (!input || typeof input !== "object" || Object.keys(input).length)
          throw new Error("No arguments expected");
        return refresh();
      },
    });
    register({
      name: "semester_write_batch",
      description:
        "Save creates, updates and deletes atomically to the same database used by this interface. Requires the current revision and an idempotency key. Task completion does not prove mastery.",
      inputSchema: {
        ...batchInput,
        properties: {
          ...batchInput.properties,
          idempotencyKey: { type: "string", minLength: 8, maxLength: 100 },
        },
        required: [...batchInput.required, "idempotencyKey"],
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input: unknown) => {
        if (!input || typeof input !== "object") throw new Error("Revision and idempotencyKey required");
        const { idempotencyKey, ...body } = input as Record<string, unknown>;
        if (typeof idempotencyKey !== "string") throw new Error("Revision and idempotencyKey required");
        const parsed = batchSchema.parse(body);
        return write(
          parsed.operations,
          "Änderungen des Agenten gespeichert.",
          parsed.revision,
          idempotencyKey,
          parsed.reason,
          parsed.moduleScope,
        );
      },
    });
    return () => lifecycle.abort();
  }, [demo, refresh, write]);
  const topic = (id: string) => data?.topics.find((t) => t.id === id);
  const mod = (id: string) => data?.modules.find((m) => m.id === id);
  const topicModule = (id: string) => mod(topic(id)?.moduleId || "");
  const form = (entity: Edit["entity"], value?: EditValues, defaults?: EditValues) => {
    if (!data) return;
    if (!value && entity !== "modules" && entity !== "plans") {
      if (!data.modules.length) {
        setToast("Lege zuerst ein Modul an.");
        setEdit({ entity: "modules", revision });
        return;
      }
      if (!["topics", "deadlines"].includes(entity) && !data.topics.length) {
        setToast("Lege zuerst ein Thema an, dem du den Eintrag zuordnen kannst.");
        setEdit({ entity: "topics", revision });
        return;
      }
    }
    setEdit({ entity, value, defaults, revision });
  };
  const heading: Record<string, [string, string]> = {
    Heute: ["Heute", "Dein nächster Lernschritt. Das Lernen geht im Fachchat weiter."],
    Module: ["Module", "Deine Themen und ihr nachgewiesener Lernstand."],
    Lernplan: ["Lernplan", "Dein Tag. Deine Woche. Dein nächster Schritt."],
    Aufgaben: ["Lernaufgaben", "Lernen, üben und selbstständig anwenden."],
    Wiederholungen: ["Wiederholungen", "Fällige Themen gezielt wieder aufnehmen."],
    Wissensstand: ["Wissensstand", "Was du ohne Hilfe lösen kannst – und was noch fehlt."],
    Termine: ["Klausuren & Abgaben", "Alle wichtigen Termine an einem Ort."],
    "Agent & API": ["ChatGPT & Schnittstellen", "Dein Lernagent arbeitet mit denselben Daten wie du."],
  };
  const due =
    data?.reviews.filter((r) => r.status === "offen" && r.date <= today()) ||
    [];
  const taskRow = (t: Task) => (
    <div
      className={"task-row " + (t.status === "erledigt" ? "done" : "")}
      key={t.id}
    >
      <button
        disabled={busy}
        className="checkbox"
        aria-label={`${t.title}: ${t.status === "erledigt" ? "wieder öffnen" : "als erledigt markieren"}`}
        aria-pressed={t.status === "erledigt"}
        onClick={() =>
          safeWrite(
            [
              {
                entity: "tasks",
                action: "update",
                id: t.id,
                data: {
                  status: t.status === "erledigt" ? "offen" : "erledigt",
                },
              },
            ],
            t.status === "erledigt"
              ? "Aufgabe wieder geöffnet."
              : "Aufgabe erledigt. Dein Wissensnachweis bleibt separat.",
          )
        }
      >
        <Check
          size={13}
          style={{ visibility: t.status === "erledigt" ? "visible" : "hidden" }}
        />
      </button>
      <button className="task-body" onClick={() => form("tasks", t)}>
        <b className="short-task-title">{t.title}</b>
        <span>
          <i
            className="module-dot"
            style={{ background: topicModule(t.topicId)?.color }}
          />
          {topicModule(t.topicId)?.title}
          <em>·</em>
          {t.kind}
        </span>
      </button>
      {t.sourceMaterialId && <a className="task-source-link" href={materialHref(t.sourceMaterialId, t.sourcePageStart)} target="_blank" rel="noopener noreferrer" title="Originalunterlage öffnen">
        <ExternalLink size={13} /> Quelle{t.sourcePageStart ? ` · S. ${t.sourcePageStart}${t.sourcePageEnd ? `–${t.sourcePageEnd}` : ""}` : ""}{t.sourceExercise ? ` · Aufgabe ${t.sourceExercise}` : ""}
      </a>}
      <div className="task-meta">
        {t.priority === 3 && t.status !== "erledigt" && (
          <small className="badge gray">Hohe Priorität</small>
        )}
        <span>
          <Clock3 size={13} />
          {t.minutes} min
        </span>
      </div>
    </div>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href={demo ? "/demo" : "/"} aria-label="Semester – zu Heute">
          <Image
            className="brand-mark"
            src="/semester-mark.png"
            alt=""
            width={44}
            height={44}
          />
          <span className="brand-wordmark">semester<span className="brand-dot">.</span></span>
        </a>
        <nav>
          {links.map(({ icon: Icon, label }) => (
            <button
              className={view === label ? "nav-item active" : "nav-item"}
              onClick={() => navigate(label)}
              key={label}
            >
              <Icon size={19} />
              {label}
              {label === "Wiederholungen" && due.length > 0 && (
                <span className="nav-count">{due.length}</span>
              )}
            </button>
          ))}
          <button
            className="nav-item mobile-agent"
            onClick={() => navigate("Agent & API")}
          >
            <Plug size={19} />
            Agent & API
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button
            className={"nav-item " + (view === "Agent & API" ? "active" : "")}
            onClick={() => navigate("Agent & API")}
          >
            <Plug size={18} />
            Agent & API
          </button>
          <p className="sidebar-caption">{demo ? "Fiktives Demosemester" : "Dein privater Lernraum"}</p>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Mein Studium <span className="slash">/</span> <b>{view}</b>
          </span>
          <div>
            <button
              className="icon-button"
              aria-label="Daten aktualisieren"
              onClick={() =>
                refresh()
                  .then(() => setToast("Daten aktualisiert."))
                  .catch((e) => setError(e.message))
              }
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        <main>
          {demo && <aside className="demo-banner" aria-label="Demomodus"><div><strong>Interaktive Demo</strong><span>Alle Inhalte sind fiktiv. Änderungen bleiben nur in diesem Browser-Tab.</span></div><button className="text-button" onClick={() => window.location.reload()}><RefreshCw size={14} />Demo zurücksetzen</button></aside>}
          <div className="page-heading">
            <div>
              {view === "Heute" && <div className="eyebrow">
                {fmt(today(), {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }).toUpperCase()}
              </div>}
              <h1>{heading[view][0]}</h1>
              <p>{heading[view][1]}</p>
            </div>
            {(view === "Aufgaben" || (view === "Heute" && !!data?.topics.length)) && <button
              className="primary"
              disabled={!data}
              onClick={() => form("tasks")}
            >
              <Plus size={17} />
              Lernaufgabe
            </button>}
          </div>
          {error && (
            <div role="alert" className="error-box">
              {error}
              <button
                onClick={() => setError("")}
                aria-label="Fehlermeldung schließen"
              >
                <X size={16} />
              </button>
              {error.includes("anmelden") && (
                <a href="/login" target="_top">
                  Anmelden
                </a>
              )}
              {!data && (
                <button
                  className="text-button"
                  onClick={() =>
                    api("/api/setup", { method: "POST" })
                      .then(refresh)
                      .then(() => setError(""))
                      .catch((e) => setError(e.message))
                  }
                >
                  Erneut versuchen
                </button>
              )}
            </div>
          )}
          {!data && !error && (
            <div className="empty-state">
              <RefreshCw size={24} />
              <h2>Dein Semester wird geladen …</h2>
            </div>
          )}
          {data && (
            <>
              {view === "Heute" && <TodayView data={data} editTask={t=>form("tasks",t)} editSession={t=>form("sessions",undefined,{topicId:t.topicId,taskId:t.id,minutes:0})} openPlan={()=>navigate("Lernplan")} editPlan={(p,d)=>form("plans",p,d)}/>}
              {view === "Module" && (
                <>
                  <div className="toolbar">
                    <div className="search-field">
                      <Search size={16} />
                      <input
                        aria-label="Module oder Themen suchen"
                        placeholder="Modul oder Thema suchen …"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <button
                      className="secondary"
                      onClick={() => form("modules")}
                    >
                      <Plus size={16} />
                      Modul hinzufügen
                    </button>
                  </div>
                  {!moduleId && !data.modules.length && <section className="panel"><Empty text="Deine Module finden hier ihren Platz." action={() => form("modules")} label="Erstes Modul anlegen" /></section>}
                  {!moduleId && search && !data.modules.some(m => m.title.toLowerCase().includes(search.toLowerCase()) || data.topics.some(t => t.moduleId === m.id && t.title.toLowerCase().includes(search.toLowerCase()))) && <Empty text="Keine passenden Module oder Themen gefunden." />}
                  {!moduleId && (
                    <div className="module-grid">
                      {data.modules
                        .filter(
                          (m) =>
                            !search ||
                            m.title
                              .toLowerCase()
                              .includes(search.toLowerCase()) ||
                            data.topics.some(
                              (t) =>
                                t.moduleId === m.id &&
                                t.title
                                  .toLowerCase()
                                  .includes(search.toLowerCase()),
                            ),
                        )
                        .map((m) => (
                          <button
                            className="panel module-card"
                            key={m.id}
                            onClick={() => setModuleId(m.id)}
                          >
                            <div className="module-card-top">
                              <span
                                className="module-icon"
                                style={{
                                  color: m.color,
                                  background: m.color + "18",
                                }}
                              >
                                {m.code}
                              </span>
                              <ArrowUpRight size={18} />
                            </div>
                            <h2>{m.title}</h2>
                            <p>
                              {m.credits} ECTS · {m.examDate ? `Klausur ${fmt(m.examDate)}` : "Klausurtermin offen"}
                            </p>
                            <div className="module-card-numbers">
                              <b>{data.topics.some(t => t.moduleId === m.id) ? `${progress(data, m.id)}%` : "–"}</b>
                              <span>selbstständig anwendbar</span>
                            </div>
                            <div className="progress">
                              <i
                                style={{
                                  width: progress(data, m.id) + "%",
                                  background: m.color,
                                }}
                              />
                            </div>
                            <div className="module-card-footer">
                              <span>
                                {
                                  data.topics.filter(
                                    (t) =>
                                      t.moduleId === m.id && mastered(data, t),
                                  ).length
                                }
                                /
                                {
                                  data.topics.filter((t) => t.moduleId === m.id)
                                    .length
                                }{" "}
                                nachgewiesen
                              </span>
                              <span
                                className={
                                  "badge " +
                                  (!data.topics.some(t => t.moduleId === m.id) ? "gray" : risks(data).some(t=>t.moduleId===m.id) ? "amber" : "gray")
                                }
                              >
                                {!data.topics.some(t => t.moduleId === m.id) ? "Themen ergänzen" : risks(data).some(t=>t.moduleId===m.id) ? "Plan prüfen" : "Keine Terminwarnung"}
                              </span>
                            </div>
                          </button>
                        ))}
                    </div>
                  )}
                  {moduleId && mod(moduleId) && (
                    <>
                      <div className="detail-heading">
                        <button
                          className="text-button"
                          onClick={() => setModuleId(null)}
                        >
                          <ChevronLeft size={16} />
                          Alle Module
                        </button>
                        <h2>{mod(moduleId)?.title}</h2>
                        <div>
                          <button
                            className="secondary"
                            onClick={() => form("modules", mod(moduleId))}
                          >
                            <Pencil size={14} />
                            Modul bearbeiten
                          </button>
                          <button
                            className="primary"
                            onClick={() =>
                              form("topics", undefined, { moduleId })
                            }
                          >
                            <Plus size={15} />
                            Thema
                          </button>
                        </div>
                      </div>
                      <div className="evidence-note">
                        <Target size={20} />
                        <div>
                          <b>
                            {data.topics.some(t => t.moduleId === moduleId) ? `${progress(data, moduleId)}% selbstständig nachgewiesen` : "Noch keine Themen angelegt"}
                          </b>
                          <p>
                            Aktuelles Lernziel: {mod(moduleId)?.target}%.
                            „Sicher“ plus neuester Test ab 80% ohne Hilfe ergibt
                            einen Nachweis.
                          </p>
                        </div>
                      </div>
                      {mod(moduleId)?.learningNotes && <div className="module-learning-note"><b>Lernnotiz</b><p>{mod(moduleId)?.learningNotes}</p></div>}
                      <TopicOverview data={data} moduleId={moduleId} search={search} editTopic={t=>form("topics",t)} testTopic={t=>form("tests",undefined,{topicId:t.id})}/>
                      <MaterialsPanel key={moduleId} moduleId={moduleId} revision={revision} onChange={() => { void refresh(); }} />
                    </>
                  )}
                </>
              )}
              {view === "Aufgaben" && (
                <>
                  <div className="toolbar">
                    <div className="segmented">
                      {["offen", "erledigt", "alle"].map((f) => (
                        <button
                          className={filter === f ? "selected" : ""}
                          key={f}
                          onClick={() => setFilter(f)}
                        >
                          {f === "offen"
                            ? "Offen"
                            : f === "erledigt"
                              ? "Erledigt"
                              : "Alle"}
                        </button>
                      ))}
                    </div>
                    <div className="search-field">
                      <Search size={16} />
                      <input
                        aria-label="Aufgaben suchen"
                        placeholder="Aufgaben suchen …"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  {Array.from(
                    new Set(
                      data.tasks
                        .filter(
                          (t) =>
                            (filter === "alle" || t.status === filter) &&
                            t.title
                              .toLowerCase()
                              .includes(search.toLowerCase()),
                        )
                        .map((t) => t.date),
                    ),
                  )
                    .sort()
                    .map((date) => (
                      <section className="panel spaced-panel" key={date}>
                        <div className="panel-head">
                          <h2>
                            {date === today()
                              ? "Heute"
                              : fmt(date, {
                                  weekday: "long",
                                  day: "numeric",
                                  month: "long",
                                })}
                            {date < today() && filter !== "erledigt" && (
                              <span className="badge amber">
                                Datum liegt zurück
                              </span>
                            )}
                          </h2>
                        </div>
                        {data.tasks
                          .filter(
                            (t) =>
                              t.date === date &&
                              (filter === "alle" || t.status === filter) &&
                              t.title
                                .toLowerCase()
                                .includes(search.toLowerCase()),
                          )
                          .sort((a, b) => a.time.localeCompare(b.time))
                          .map(taskRow)}
                      </section>
                    ))}
                  {!data.tasks.some(
                    (t) =>
                      (filter === "alle" || t.status === filter) &&
                      t.title.toLowerCase().includes(search.toLowerCase()),
                  ) && (
                    <Empty
                      text="Keine passenden Aufgaben."
                      action={() => form("tasks")}
                      label="Aufgabe hinzufügen"
                    />
                  )}
                </>
              )}
              {view === "Lernplan" && (
                <>
                  <div className="toolbar">
                    <div className="segmented">
                      {["Tag", "Woche", "Semester"].map((v) => (
                        <button
                          key={v}
                          className={planView === v ? "selected" : ""}
                          onClick={() => setPlanView(v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    {planView !== "Semester" && <div className="date-controls">
                      <button
                        aria-label="Vorheriger Zeitraum"
                        onClick={() =>
                          planView === "Woche"
                            ? setWeek(offsetDate(week, -7))
                            : setSelectedDate(offsetDate(selectedDate, -1))
                        }
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <b>
                        {planView === "Woche"
                          ? `${fmt(week)} – ${fmt(offsetDate(week, 6))}`
                          : fmt(selectedDate, {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                            })}
                      </b>
                      <button
                        aria-label="Nächster Zeitraum"
                        onClick={() =>
                          planView === "Woche"
                            ? setWeek(offsetDate(week, 7))
                            : setSelectedDate(offsetDate(selectedDate, 1))
                        }
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>}
                    <button
                      className="secondary"
                      onClick={() =>
                        setProposal({ ...proposeWeek(data), revision })
                      }
                    >
                      <Command size={16} />
                      Nächste Woche planen
                    </button>
                  </div>
                  {planView !== "Semester" && <WeekBudget data={data} start={planView === "Tag" ? monday(selectedDate) : week} editPlan={(p,d)=>form("plans",p,d)}/>}
                  {planView === "Semester" ? <SemesterFrame data={data} editTopic={t=>form("topics",t)} editPlan={p=>form("plans",p)}/> : planView === "Woche" ? (
                    <div className="week-grid">
                      {Array.from({ length: 7 }, (_, i) => {
                        const date = offsetDate(week, i),
                          tasks = data.tasks
                            .filter((t) => t.date === date)
                            .sort((a, b) => a.time.localeCompare(b.time));
                        return (
                          <section
                            className={
                              "day-column " +
                              (date === today() ? "is-today" : "")
                            }
                            key={date}
                          >
                            <div className="day-heading">
                              <span>{fmt(date, { weekday: "short" })}</span>
                              <b>{fmt(date, { day: "numeric" })}</b>
                              <small>
                                {tasks.reduce((n, t) => n + t.minutes, 0)} min
                              </small>
                            </div>
                            {tasks.map((t) => (
                              <button
                                className={
                                  "calendar-task " +
                                  (t.status === "erledigt" ? "completed" : "")
                                }
                                style={{
                                  borderLeftColor: topicModule(t.topicId)
                                    ?.color,
                                }}
                                key={t.id}
                                onClick={() => form("tasks", t)}
                              >
                                <span>
                                  {t.time} · {t.minutes} min
                                </span>
                                <b className="short-task-title">{t.title}</b>
                                <small>
                                  {topicModule(t.topicId)?.code} · {t.kind}
                                </small>
                              </button>
                            ))}
                            <button
                              className="day-add"
                              aria-label={
                                "Aufgabe am " + fmt(date) + " hinzufügen"
                              }
                              onClick={() => form("tasks", undefined, { date })}
                            >
                              <Plus size={16} />
                            </button>
                          </section>
                        );
                      })}
                    </div>
                  ) : (
                    <section className="panel">
                      {data.tasks
                        .filter((t) => t.date === selectedDate)
                        .sort((a, b) => a.time.localeCompare(b.time))
                        .map((t) => (
                          <div className="timeline-row" key={t.id}>
                            <span>{t.time}</span>
                            {taskRow(t)}
                          </div>
                        ))}
                      {!data.tasks.some((t) => t.date === selectedDate) && (
                        <Empty
                          text="Hier ist noch Platz für deinen Lernplan."
                          action={() =>
                            form("tasks", undefined, { date: selectedDate })
                          }
                          label="Aufgabe planen"
                        />
                      )}
                    </section>
                  )}
                  <details className="panel study-plan-history"><summary>Letzte Planänderungen</summary>{audit.filter(a=>["tasks","plans","topics"].includes(a.entity)).slice(0,12).map(a=><div key={a.id}><b>{a.reason || "Kein Grund dokumentiert"}</b><p>{fmt(a.date)} · {a.actor} · {a.entity} · {a.action}</p><details><summary>Änderung ansehen</summary><pre>{JSON.stringify({vorher:a.before?JSON.parse(a.before):null,nachher:a.after?JSON.parse(a.after):null},null,2)}</pre></details></div>)}</details>
                </>
              )}
              {view === "Wiederholungen" && (
                <>
                  <div className="toolbar">
                    <p>
                      {due.length} fällig ·{" "}
                      {
                        data.reviews.filter(
                          (r) => r.status === "offen" && r.date < today(),
                        ).length
                      }{" "}
                      überfällig
                    </p>
                    <button
                      className="secondary"
                      onClick={() => form("reviews")}
                    >
                      <Plus size={16} />
                      Wiederholung planen
                    </button>
                  </div>
                  <div className="evidence-note">
                    <Repeat2 size={20} />
                    <div>
                      <b>Aktiv erinnern, dann anwenden.</b>
                      <p>
                        „Wiederholt“ plant den nächsten Termin mit dem
                        hinterlegten Abstand. Einen Wissensnachweis erfasst du
                        über einen Selbsttest.
                      </p>
                    </div>
                  </div>
                  <section className="panel">
                    {data.reviews
                      .filter((r) => r.status === "offen")
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((r) => (
                        <div className="review-row" key={r.id}>
                          <span
                            className="module-icon"
                            style={{
                              color: topicModule(r.topicId)?.color,
                              background: topicModule(r.topicId)?.color + "18",
                            }}
                          >
                            <Repeat2 size={19} />
                          </span>
                          <div className="grow">
                            <button
                              className="row-title"
                              onClick={() => form("reviews", r)}
                            >
                              {topic(r.topicId)?.title}
                            </button>
                            <p>
                              {topicModule(r.topicId)?.title} · alle{" "}
                              {r.interval} Tage
                            </p>
                          </div>
                          <span
                            className={
                              "badge " +
                              (r.date < today()
                                ? "amber"
                                : r.date === today()
                                  ? "purple"
                                  : "gray")
                            }
                          >
                            {r.date === today() ? "Heute" : fmt(r.date)}
                          </span>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              safeWrite(
                                [
                                  {
                                    entity: "reviews",
                                    action: "update",
                                    id: r.id,
                                    data: { status: "erledigt" },
                                  },
                                  {
                                    entity: "reviews",
                                    action: "create",
                                    data: {
                                      topicId: r.topicId,
                                      date: offsetDate(today(), r.interval),
                                      status: "offen",
                                      interval: r.interval,
                                    },
                                  },
                                  {
                                    entity: "topics",
                                    action: "update",
                                    id: r.topicId,
                                    data: { lastPracticed: today() },
                                  },
                                ],
                                "Wiederholung erledigt. Nächster Termin geplant.",
                              )
                            }
                          >
                            <Check size={15} />
                            Wiederholt
                          </button>
                        </div>
                      ))}
                    {!data.reviews.some((r) => r.status === "offen") && (
                      <Empty text="Keine offenen Wiederholungen." />
                    )}
                  </section>
                  <p className="form-hint">
                    {data.reviews.filter((r) => r.status === "erledigt").length}{" "}
                    Wiederholungen abgeschlossen
                  </p>
                </>
              )}
              {view === "Wissensstand" && (
                <>
                  <div className="toolbar">
                    <div className="tabs">
                      {[
                        "Wissenslücken",
                        "Selbsttests",
                        "Beherrscht",
                        "Verlauf",
                        "Lernzeit",
                      ].map((v) => (
                        <button
                          key={v}
                          className={knowledgeTab === v ? "selected" : ""}
                          onClick={() => setKnowledgeTab(v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <button
                      className="secondary"
                      onClick={() =>
                        form(
                          knowledgeTab === "Lernzeit"
                            ? "sessions"
                            : knowledgeTab === "Wissenslücken"
                              ? "gaps"
                              : "tests",
                        )
                      }
                    >
                      <Plus size={16} />
                      {knowledgeTab === "Lernzeit"
                        ? "Lernzeit"
                        : knowledgeTab === "Wissenslücken"
                          ? "Wissenslücke"
                          : "Selbsttest"}
                    </button>
                  </div>
                  {knowledgeTab === "Wissenslücken" && (
                    <>
                      {!data.gaps.length && <section className="panel"><Empty text="Noch keine Wissenslücken erfasst. Halte hier fest, was beim Üben unklar bleibt." action={() => form("gaps")} label="Wissenslücke festhalten" /></section>}
                      <div className="gap-grid">
                        {data.gaps.map((g) => (
                          <article className="panel gap-card" key={g.id}>
                            <div className="module-card-top">
                              <span
                                className={
                                  "badge " +
                                  (g.status === "offen" ? "amber" : "green")
                                }
                              >
                                {g.status === "offen"
                                  ? "Offene Lücke"
                                  : "Geschlossen"}
                              </span>
                              <button
                                aria-label="Wissenslücke bearbeiten"
                                onClick={() => form("gaps", g)}
                              >
                                <Pencil size={16} />
                              </button>
                            </div>
                            <h2>{topic(g.topicId)?.title}</h2>
                            <small>{topicModule(g.topicId)?.title}</small>
                            <p>{g.description}</p>
                            <div className="module-card-footer">
                              <span>{fmt(g.date)}</span>
                              <button
                                className="text-button"
                                disabled={busy}
                                onClick={() =>
                                  safeWrite([
                                    {
                                      entity: "gaps",
                                      action: "update",
                                      id: g.id,
                                      data: {
                                        status:
                                          g.status === "offen"
                                            ? "geschlossen"
                                            : "offen",
                                      },
                                    },
                                  ])
                                }
                              >
                                {g.status === "offen"
                                  ? "Lücke schließen"
                                  : "Wieder öffnen"}
                                <ArrowRight size={14} />
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                      {!!data.topics.length && <section className="panel spaced-panel neglected">
                        <div className="panel-head">
                          <h2>
                            <TriangleAlert size={18} />
                            Länger nicht geübt
                          </h2>
                          <span className="subtle">
                            Überfälliger Plan und letzte Übung vor mehr als 10 Tagen
                          </span>
                        </div>
                        {risks(data)
                          .filter(
                            (t) =>
                              !!t.lastPracticed &&
                              t.lastPracticed < offsetDate(today(), -10),
                          )
                          .map((t) => (
                            <div className="simple-row" key={t.id}>
                              <div>
                                <b className="short-task-title">{t.title}</b>
                                <p>
                                  {mod(t.moduleId)?.title} ·{" "}
                                  {t.lastPracticed
                                    ? "zuletzt " + fmt(t.lastPracticed)
                                    : "noch keine Übung"}
                                </p>
                              </div>
                              <button
                                className="text-button"
                                onClick={() =>
                                  form("tasks", undefined, {
                                    topicId: t.id,
                                    title: t.title + " selbstständig üben",
                                    priority: t.priority,
                                  })
                                }
                              >
                                Einplanen <Plus size={14} />
                              </button>
                            </div>
                          ))}
                      </section>}
                    </>
                  )}
                  {knowledgeTab === "Selbsttests" && (
                    <section className="panel table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Thema</th>
                            <th>Ergebnis</th>
                            <th>Ohne Hilfe</th>
                            <th>Datum</th>
                            <th>Notiz</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...data.tests]
                            .sort((a, b) => b.date.localeCompare(a.date))
                            .map((t) => (
                              <tr key={t.id}>
                                <td>
                                  <button
                                    className="row-title"
                                    onClick={() => form("tests", t)}
                                  >
                                    {topic(t.topicId)?.title}
                                  </button>
                                </td>
                                <td>
                                  <span
                                    className={
                                      "badge " +
                                      (t.score >= 80 && t.independent
                                        ? "green"
                                        : "amber")
                                    }
                                  >
                                    {t.score}%
                                  </span>
                                </td>
                                <td>{t.independent ? "Ja" : "Nein"}</td>
                                <td>{fmt(t.date)}</td>
                                <td>{t.notes || "–"}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {!data.tests.length && (
                        <Empty text="Noch keine Selbsttests erfasst." />
                      )}
                    </section>
                  )}
                  {knowledgeTab === "Beherrscht" && (
                    <>
                      <div className="evidence-note">
                        <CheckCircle2 size={20} />
                        <div>
                          <b>
                            {
                              data.topics.filter((t) => mastered(data, t))
                                .length
                            }{" "}
                            Themen nachgewiesen
                          </b>
                          <p>
                            Status „sicher“ und neuester Test ab 80% ohne Hilfe.
                            Der Nachweis bezieht sich auf den gespeicherten
                            Testzeitpunkt.
                          </p>
                        </div>
                      </div>
                      <section className="panel">
                        {!data.topics.some(t => mastered(data, t)) && <Empty text="Noch kein Thema nachgewiesen. Ein Selbsttest ohne Hilfe macht deinen Lernstand sichtbar." action={() => form("tests")} label="Selbsttest erfassen" />}
                        {data.topics
                          .filter((t) => mastered(data, t))
                          .map((t) => (
                            <div className="simple-row" key={t.id}>
                              <div>
                                <b className="short-task-title">{t.title}</b>
                                <p>{mod(t.moduleId)?.title}</p>
                              </div>
                              <span className="badge green">
                                <Check size={14} />
                                Ohne Hilfe nachgewiesen
                              </span>
                              <button
                                className="text-button"
                                onClick={() =>
                                  form("tests", undefined, { topicId: t.id })
                                }
                              >
                                Erneut testen
                              </button>
                            </div>
                          ))}
                      </section>
                    </>
                  )}
                  {knowledgeTab === "Verlauf" && (
                    <section className="panel">
                      <div className="panel-head">
                        <div>
                          <h2>Dein Wissensverlauf</h2>
                          <p>
                            Statusänderungen bleiben als Verlauf erhalten.
                            Testergebnisse findest du unter Selbsttests.
                          </p>
                        </div>
                      </div>
                      {!data.history.length && <Empty text="Sobald sich ein Themenstatus ändert, siehst du hier deinen Verlauf." />}
                      {[...data.history]
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((h) => (
                          <div className="simple-row history-row" key={h.id}>
                            <span className="history-icon">
                              <History size={16} />
                            </span>
                            <div>
                              <b>{topic(h.topicId)?.title}</b>
                              <p>
                                {h.source} · {fmt(h.date)}
                              </p>
                            </div>
                            <span
                              className={
                                "badge " +
                                (h.status === "sicher" ? "green" : "purple")
                              }
                            >
                              {h.status}
                            </span>
                          </div>
                        ))}
                    </section>
                  )}
                  {knowledgeTab === "Lernzeit" && (
                    <section className="panel">
                      <div className="panel-head">
                        <h2>
                          {hours(
                            data.sessions.reduce((s, t) => s + t.minutes, 0),
                          )}{" "}
                          Stunden insgesamt
                        </h2>
                        <span className="subtle">
                          Tatsächlich erfasste Lernzeit
                        </span>
                      </div>
                      {!data.sessions.length && <Empty text="Noch keine Lernzeit erfasst." action={() => form("sessions")} label="Lernzeit eintragen" />}
                      {[...data.sessions]
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((s) => (
                          <div className="simple-row" key={s.id}>
                            <Clock3 size={19} />
                            <div>
                              <button
                                className="row-title"
                                onClick={() => form("sessions", s)}
                              >
                                {topic(s.topicId)?.title}
                              </button>
                              <p>
                                {fmt(s.date)} · {s.notes}
                              </p>
                            </div>
                            <b>{s.minutes} min</b>
                          </div>
                        ))}
                    </section>
                  )}
                </>
              )}
              {view === "Termine" && (
                <>
                  <div className="toolbar">
                    <p>{data.deadlines.length} Klausuren und Abgaben</p>
                    <button
                      className="secondary"
                      onClick={() => form("deadlines")}
                    >
                      <Plus size={16} />
                      Termin hinzufügen
                    </button>
                  </div>
                  <section className="panel">
                    {!data.deadlines.length && <Empty text="Noch keine Klausuren oder Abgaben eingetragen." action={() => form("deadlines")} label="Termin hinzufügen" />}
                    {[...data.deadlines]
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((d) => (
                        <div className="review-row" key={d.id}>
                          <span className="date-tile">
                            <small>
                              {fmt(d.date, { month: "short" }).toUpperCase()}
                            </small>
                            {fmt(d.date, { day: "numeric" })}
                          </span>
                          <div className="grow">
                            <button
                              className="row-title"
                              onClick={() => form("deadlines", d)}
                            >
                              {d.title}
                            </button>
                            <p>
                              {mod(d.moduleId)?.title} ·{" "}
                              {fmt(d.date, {
                                weekday: "long",
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              })}
                            </p>
                          </div>
                          <span
                            className={
                              "badge " +
                              (d.kind === "Abgabe" ? "purple" : "gray")
                            }
                          >
                            {d.kind}
                          </span>
                          <button
                            className="icon-button"
                            aria-label={d.title + " bearbeiten"}
                            onClick={() => form("deadlines", d)}
                          >
                            <Pencil size={16} />
                          </button>
                        </div>
                      ))}
                  </section>
                </>
              )}
              {view === "Agent & API" && demo && <section className="panel demo-agent-panel"><span className="eyebrow">ARCHITEKTUR DER PRIVATEN APP</span><h2>Vom Lernplan in den Fachchat</h2><p>Das Cockpit organisiert. Ein verbundener Fachchat liest den aktuellen Modulkontext, ruft gezielt Originalunterlagen ab und speichert anschließend eine kurze Rückmeldung.</p><ol><li><b>Kontext lesen</b><code>semester_module_context</code><span>Regeln, Themen, Lernblöcke und Quellen-IDs</span></li><li><b>Original abrufen</b><code>semester_material_download</code><span>Privater, zeitlich begrenzter PDF-Link</span></li><li><b>Rückmeldung speichern</b><code>semester_module_feedback</code><span>Lernzeit, Hilfebedarf und nächster Schritt</span></li></ol><p className="demo-note">In dieser öffentlichen Demo sind Anmeldung, Agentenschlüssel, Uploads und Backend-APIs deaktiviert. Es wird keine Verbindung zu einem echten Semester hergestellt.</p><a className="secondary" href="/agent-guide.md">Technischen Ablauf lesen</a></section>}
              {view === "Agent & API" && !demo && (
                <>
                  <section className="work-card panel">
                    <span className="work-icon"><Plug size={24} /></span>
                    <div><h2>Mit ChatGPT Work lernen</h2><p>Verbinde dein Cockpit über die MCP-Adresse mit ChatGPT Work. Du meldest dich an und gibst den Zugriff frei. Danach kann Work Lernstände lesen und Pläne direkt speichern.</p><blockquote>„Analysiere meinen Semesterstand und plane meine nächste Lernwoche.“</blockquote><div className="button-row"><button className="secondary" onClick={() => navigator.clipboard.writeText(window.location.origin + "/api/mcp")}>MCP-Adresse kopieren</button><a className="secondary" href="/connections">Verbindungen verwalten</a></div><p className="subtle">Ergänze zuerst deine Module und Themen – oder beauftrage ChatGPT damit.</p></div>
                  </section>
                  <details className="advanced-settings panel spaced-panel">
                    <summary>Weitere Agenten & API-Zugänge <ChevronDown size={18} /></summary>
                  <div className="integration-grid">
                    <section className="panel">
                      <div className="panel-head">
                        <h2>Agent-Zugang</h2>
                        <KeyRound size={19} />
                      </div>
                      <div className="panel-content">
                        <p>
                          Erstelle einen persönlichen Schlüssel für einen
                          Agenten. Er gilt 90 Tage und lässt sich jederzeit
                          widerrufen.
                        </p>
                        <div className="form-fields">
                          <label>
                            <span>Agent-Name</span>
                            <input
                              value={keyName}
                              onChange={(e) => setKeyName(e.target.value)}
                              maxLength={60}
                            />
                          </label>
                          <label>
                            <span>Berechtigung</span>
                            <select
                              value={keyScope}
                              onChange={(e) => setKeyScope(e.target.value)}
                            >
                              <option value="read-write">
                                Lesen und schreiben
                              </option>
                              <option value="read">Nur lesen</option>
                            </select>
                          </label>
                        </div>
                        <button
                          className="primary"
                          disabled={busy || !keyName.trim()}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              const k = await api<{ token: string }>("/api/v1/keys", {
                                method: "POST",
                                body: JSON.stringify({
                                  name: keyName,
                                  scope: keyScope,
                                }),
                              });
                              setSecret(k.token);
                              setKeys((await api<{ data: AgentKey[] }>("/api/v1/keys")).data);
                              setToast(
                                "Agent-Schlüssel erstellt. Jetzt sicher kopieren.",
                              );
                            } catch (e) {
                              setError(errorMessage(e));
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          <Plus size={16} />
                          Schlüssel erstellen
                        </button>
                        {secret && (
                          <div className="secret-box">
                            <b>Nur jetzt sichtbar</b>
                            <code>{secret}</code>
                            <button
                              className="text-button"
                              onClick={() =>
                                navigator.clipboard
                                  .writeText(secret)
                                  .then(() => setToast("Schlüssel kopiert."))
                                  .catch(() =>
                                    setError(
                                      "Bitte den Schlüssel manuell markieren und kopieren.",
                                    ),
                                  )
                              }
                            >
                              <Copy size={14} />
                              Kopieren
                            </button>
                            <button
                              className="text-button"
                              onClick={() => setSecret("")}
                            >
                              Ausblenden
                            </button>
                          </div>
                        )}
                        {keys.map((k) => (
                          <div className="key-row" key={k.id}>
                            <div>
                              <b>{k.name}</b>
                              <p>
                                {k.scope === "read"
                                  ? "Nur lesen"
                                  : "Lesen & schreiben"}{" "}
                                · bis {fmt(k.expiresAt)}
                              </p>
                            </div>
                            {k.revoked ? (
                              <span className="badge gray">Widerrufen</span>
                            ) : (
                              <button
                                className="text-button"
                                disabled={busy}
                                onClick={async () => {
                                  try {
                                    await api("/api/v1/keys/" + k.id, {
                                      method: "DELETE",
                                    });
                                    setKeys((await api<{ data: AgentKey[] }>("/api/v1/keys")).data);
                                    setToast("Schlüssel widerrufen.");
                                  } catch (e) {
                                    setError(errorMessage(e));
                                  }
                                }}
                              >
                                Widerrufen
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="panel">
                      <div className="panel-head">
                        <h2>Schnittstellen & Verbindung</h2>
                        <Command size={19} />
                      </div>
                      <div className="panel-content">
                        <div className="endpoint-row">
                          <span>REST API</span>
                          <code>/api/v1</code>
                        </div>
                        <div className="endpoint-row">
                          <span>MCP über HTTP</span>
                          <code>/api/mcp</code>
                        </div>
                        <div className="endpoint-row">
                          <span>WebMCP</span>
                          <span>Im unterstützten Browser</span>
                        </div>
                        <p className="form-hint">
                          Verbinde ChatGPT Work über die MCP-Adresse und gib
                          den Zugriff auf dein Cockpit frei. Andere API-Clients
                          können einen widerrufbaren Agent-Schlüssel verwenden.
                          Alle Zugriffe arbeiten mit denselben Lerndaten.
                        </p>
                        <div className="button-row">
                          <a
                            className="secondary"
                            href="/api/v1/openapi.json"
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink size={15} />
                            OpenAPI öffnen
                          </a>
                          <a
                            className="secondary"
                            href="/agent-guide.md"
                            target="_blank"
                            rel="noreferrer"
                          >
                            <BookOpen size={15} />
                            Verbindungsanleitung
                          </a>
                          <a
                            className="secondary"
                            href="/semester-mcp.mjs"
                            download
                          >
                            <Download size={15} />
                            MCP-Adapter
                          </a>
                        </div>
                      </div>
                    </section>
                  </div>
                  </details>
                  <section className="panel spaced-panel">
                    <div className="panel-head">
                      <h2>Änderungsprotokoll</h2>
                      <span className="subtle">
                        Letzte 30 Änderungen · Revision {revision}
                      </span>
                    </div>
                    {audit.length ? (
                      audit.slice(0, 30).map((a) => (
                        <div className="simple-row" key={a.id}>
                          <span className="history-icon">
                            <History size={16} />
                          </span>
                          <div>
                            <b>
                              {a.actor} · {a.entity}{a.reason ? ` · ${a.reason}` : ""}
                            </b>
                            <p>
                              {a.action === "cleanup" ? "Beispieldaten entfernt" : a.action === "create"
                                ? "Erstellt"
                                : a.action === "update"
                                  ? "Aktualisiert"
                                  : "Gelöscht"}{" "}
                              · {new Date(a.date).toLocaleString("de-DE")} ·
                              Revision {a.revision}
                            </p>
                          </div>
                          <details>
                            <summary>Details</summary>
                            <pre>
                              {JSON.stringify(
                                {
                                  vorher: a.before
                                    ? JSON.parse(a.before)
                                    : null,
                                  nachher: a.after ? JSON.parse(a.after) : null,
                                },
                                null,
                                2,
                              )}
                            </pre>
                          </details>
                        </div>
                      ))
                    ) : (
                      <Empty text="Noch keine Änderungen gespeichert." />
                    )}
                  </section>
                </>
              )}

            </>
          )}
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {edit && data && (
        <Editor
          key={edit.entity + (edit.value?.id || "new")}
          edit={edit}
          data={data}
          busy={busy}
          onClose={() => setEdit(null)}
          onSave={async (value, reason) => {
            if (!edit.value) value = { ...value, id: crypto.randomUUID() };
            const ops: Operation[] = [
              {
                entity: edit.entity,
                action: edit.value ? "update" : "create",
                ...(edit.value ? { id: edit.value.id } : {}),
                data: value,
              },
            ];
            await write(ops, "Gespeichert.", edit.revision, undefined, reason);
            setEdit(null);
            if (edit.entity === "modules" && !edit.value) {
              navigate("Module");
              const createdModule = snapshotRef.current.data?.modules.find(m => m.id === value.id);
              if (createdModule) setModuleId(createdModule.id);
            }
          }}
        />
      )}
      {proposal && (
        <Modal
          title="Deine nächste Lernwoche"
          onClose={() => setProposal(null)}
        >
          <div className="panel-content">
            <span className="badge purple">
              Regelbasierter Vorschlag · keine KI verbunden
            </span>
            <h3>
              {fmt(proposal.plan.startDate)} – {fmt(proposal.plan.endDate)}
            </h3>
            <p>{proposal.plan.notes}</p>
            <p>
              <b>
                {proposal.tasks.length} neue Aufgaben ·{" "}
                {hours(proposal.tasks.reduce((n, t) => n + t.minutes, 0))}{" "}
                Stunden
              </b>
            </p>
            <div className="proposal-list">
              {proposal.tasks.map((t) => (
                <div key={t.id}>
                  <span>
                    {fmt(t.date)} · {t.time}
                  </span>
                  <b className="short-task-title">{t.title}</b>
                  <small>{t.minutes} min</small>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setProposal(null)}>
                Abbrechen
              </button>
              <button
                className="primary"
                disabled={busy || !proposal.tasks.length}
                onClick={async () => {
                  try {
                    await write(
                      proposal.operations,
                      "Wochenplan gespeichert.",
                      proposal.revision,
                    );
                    setWeek(proposal.plan.startDate);
                    navigate("Lernplan");
                    setPlanView("Woche");
                    setProposal(null);
                  } catch {}
                }}
              >
                Plan übernehmen
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Empty({
  text,
  action,
  label,
}: {
  text: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty-state">
      <BookOpen size={23} />
      <p>{text}</p>
      {action && (
        <button className="text-button" onClick={action}>
          {label}
          <Plus size={15} />
        </button>
      )}
    </div>
  );
}

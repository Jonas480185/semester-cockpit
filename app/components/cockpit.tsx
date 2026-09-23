"use client";
import Image from "next/image";
import { clientRequest, materialHref } from "@/lib/client-request";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
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
  TriangleAlert,
  Search,
  CheckCircle2,
  Pencil,
  RefreshCw,
  Download,
  KeyRound,
  Copy,
  ExternalLink,
  X,
  History,
  Ellipsis,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Flag,
  FileText,
  CalendarRange,
  type LucideIcon,
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
import { TodayView, WeekBudget, TopicOverview, SemesterFrame, EvidenceBar } from "./study-views";
import { moduleRoadmap, taskOrder, topicStage } from "@/lib/study-planning";
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
const duration = (n: number) => (n < 60 ? `${n} Min.` : `${hours(n)} Std.`);
const links: { icon: LucideIcon; label: string; group: "Lernen" | "Überblick"; mobile?: boolean }[] = [
  { icon: LayoutDashboard, label: "Heute", group: "Lernen", mobile: true },
  { icon: BookOpen, label: "Module", group: "Lernen", mobile: true },
  { icon: CalendarDays, label: "Lernplan", group: "Lernen", mobile: true },
  { icon: ListTodo, label: "Aufgaben", group: "Lernen", mobile: true },
  { icon: Repeat2, label: "Wiederholungen", group: "Lernen" },
  { icon: ChartNoAxesCombined, label: "Wissensstand", group: "Überblick" },
  { icon: CalendarClock, label: "Termine", group: "Überblick" },
];
const entityLabel: Record<string, string> = { tasks: "Lernblock", plans: "Plan", topics: "Thema", modules: "Modul", tests: "Selbsttest", gaps: "Wissenslücke", sessions: "Lernzeit", reviews: "Wiederholung", deadlines: "Termin", materials: "Material" };
const actionLabel = (a: string) => a === "cleanup" ? "Beispieldaten entfernt" : a === "create" ? "Erstellt" : a === "update" ? "Aktualisiert" : "Gelöscht";
const daysUntil = (d: string) =>
  Math.round((Date.parse(d.slice(0, 10) + "T12:00:00Z") - Date.parse(today() + "T12:00:00Z")) / 86400000);
const relativeDay = (d: string) => {
  const n = daysUntil(d);
  return n === 0 ? "heute" : n === 1 ? "morgen" : n === -1 ? "gestern" : n > 0 ? `in ${n} Tagen` : `vor ${-n} Tagen`;
};
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
const currentModuleId = () => currentView() === "Module" ? new URLSearchParams(location.search).get("modul") : null;
const initialModuleId = () => null;
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
  const moduleId = useSyncExternalStore(subscribeView, currentModuleId, initialModuleId);
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
  const [moreOpen, setMoreOpen] = useState(false);
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
  // After a view change, move keyboard and screen reader focus to the content.
  const focusMain = () =>
    requestAnimationFrame(() => document.getElementById("main")?.focus({ preventScroll: true }));
  const navigate = (v: string) => {
    setSearch("");
    setMoreOpen(false);
    history.pushState(null, "", "?view=" + encodeURIComponent(v));
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({ top: 0 });
    focusMain();
  };
  const openModule = (id: string) => {
    setSearch("");
    history.pushState(null, "", "?view=Module&modul=" + encodeURIComponent(id));
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({ top: 0 });
    focusMain();
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
  const moduleStats = (id: string) => {
    const ts = data?.topics.filter((t) => t.moduleId === id) || [];
    const stages = data ? ts.map((t) => topicStage(data, t)) : [];
    return {
      total: ts.length,
      confirmed: stages.filter((s) => s === "selbstständig bestätigt").length,
      worked: stages.filter((s) => s === "bearbeitet").length,
    };
  };
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
    Heute: ["Heute", "Dein nächster Lernschritt. Gelernt wird im Fachchat."],
    Module: ["Module", "Themen, Lernstand und Materialien je Fach."],
    Lernplan: ["Lernplan", "Tag, Woche und Semester mit Budgets und Konflikten."],
    Aufgaben: ["Lernaufgaben", "Alle konkreten Lernblöcke, nach Datum geordnet."],
    Wiederholungen: ["Wiederholungen", "Fällige Themen gezielt wieder aufnehmen."],
    Wissensstand: ["Wissensstand", "Was du ohne Hilfe lösen kannst – und was noch fehlt."],
    Termine: ["Klausuren & Abgaben", "Alle festen Termine an einem Ort."],
    "Agent & API": ["Agent & API", "Fachchats und Agenten arbeiten mit denselben Daten wie du."],
  };
  const due =
    data?.reviews.filter((r) => r.status === "offen" && r.date <= today()) ||
    [];
  const taskRow = (t: Task) => {
    const m = topicModule(t.topicId);
    return (
      <div
        className={"task-row " + (t.status === "erledigt" ? "done" : "")}
        key={t.id}
        style={{ "--module": m?.color } as React.CSSProperties}
      >
        <button
          disabled={busy}
          className="checkbox"
          aria-label={`${t.title}: ${t.status === "erledigt" ? "wieder öffnen" : "als bearbeitet markieren"}`}
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
          <span aria-hidden="true"><Check size={14} strokeWidth={2.5} /></span>
        </button>
        <button className="task-body" onClick={() => form("tasks", t)}>
          <b className="short-task-title">{t.title}</b>
          <span className="task-sub">
            <i className="module-dot" style={{ background: m?.color }} />
            <span className="task-module">{m?.title}</span>
            {t.kind !== "Lernen" && <span className="kind-tag">{t.kind}</span>}
          </span>
        </button>
        <div className="task-meta">
          {t.sourceMaterialId && <a className="source-chip" href={materialHref(t.sourceMaterialId, t.sourcePageStart)} target="_blank" rel="noopener noreferrer" aria-label={`Originalunterlage zu „${t.title}“ öffnen`}>
            <FileText size={14} aria-hidden="true" /> {t.sourcePageStart ? `S. ${t.sourcePageStart}${t.sourcePageEnd ? `–${t.sourcePageEnd}` : ""}` : "Quelle"}{t.sourceExercise ? ` · Aufg. ${t.sourceExercise}` : ""}
          </a>}
          {t.priority === 3 && t.status !== "erledigt" && (
            <span className="meta-flag"><Flag size={13} aria-hidden="true" />Hoch</span>
          )}
          <span className="task-duration">
            <Clock3 size={14} aria-hidden="true" />
            {t.time} · {t.minutes} Min.
          </span>
        </div>
      </div>
    );
  };
  const navButton = ({ icon: Icon, label }: (typeof links)[number]) => (
    <button
      className={view === label ? "nav-item active" : "nav-item"}
      aria-current={view === label ? "page" : undefined}
      onClick={() => navigate(label)}
      key={label}
    >
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
      {label === "Wiederholungen" && due.length > 0 && (
        <span className="nav-count" aria-label={`${due.length} fällig`}>{due.length}</span>
      )}
    </button>
  );
  const refreshNow = () =>
    refresh()
      .then(() => setToast("Daten aktualisiert."))
      .catch((e) => setError(e.message));
  const mobileViews = links.filter((l) => l.mobile).map((l) => l.label);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Zum Inhalt springen</a>
      <aside className="sidebar" aria-label="Hauptnavigation">
        <Link className="brand" href={demo ? "/demo" : "/"} aria-label="Semester – zu Heute" onClick={(e) => { e.preventDefault(); navigate("Heute"); }}>
          <Image className="brand-mark" src="/semester-mark.png" alt="" width={32} height={32} priority />
          <span className="brand-wordmark">semester<span className="brand-dot">.</span></span>
        </Link>
        <nav>
          {(["Lernen", "Überblick"] as const).map((group) => (
            <div className="nav-group" key={group}>
              <p className="nav-label">{group}</p>
              {links.filter((l) => l.group === group).map(navButton)}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {navButton({ icon: Plug, label: "Agent & API", group: "Überblick" })}
          <div className="sidebar-sync">
            <span>{demo ? "Fiktives Demosemester" : "Privater Lernraum"}{revision ? ` · Rev. ${revision}` : ""}</span>
            <button
              className="icon-button small"
              aria-label="Daten aktualisieren"
              title="Daten aktualisieren"
              onClick={refreshNow}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
      </aside>
      <header className="mobile-bar">
        <Link className="brand" href={demo ? "/demo" : "/"} aria-label="Semester – zu Heute" onClick={(e) => { e.preventDefault(); navigate("Heute"); }}>
          <Image className="brand-mark" src="/semester-mark.png" alt="" width={28} height={28} />
          <span className="brand-wordmark">semester<span className="brand-dot">.</span></span>
        </Link>
        <button className="icon-button" aria-label="Daten aktualisieren" onClick={refreshNow}>
          <RefreshCw size={18} />
        </button>
      </header>
      <nav className="tabbar" aria-label="Hauptnavigation mobil">
        {links.filter((l) => l.mobile).map(({ icon: Icon, label }) => (
          <button key={label} className={view === label ? "active" : ""} aria-current={view === label ? "page" : undefined} onClick={() => navigate(label)}>
            <Icon size={21} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
        <button className={!mobileViews.includes(view) ? "active" : ""} aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
          <Ellipsis size={21} aria-hidden="true" />
          <span>Mehr</span>
          {due.length > 0 && <i className="tab-dot" aria-label={`${due.length} Wiederholungen fällig`} />}
        </button>
      </nav>
      {moreOpen && (
        <Modal title="Weitere Bereiche" className="sheet" onClose={() => setMoreOpen(false)}>
          <div className="sheet-nav">
            {[...links.filter((l) => !l.mobile), { icon: Plug, label: "Agent & API", group: "Überblick" as const }].map(navButton)}
          </div>
        </Modal>
      )}
      <div className="main-shell">
        <main id="main" tabIndex={-1}>
          {demo && <aside className="demo-banner" aria-label="Demomodus"><div><strong>Interaktive Demo</strong><span>Alle Inhalte sind fiktiv. Änderungen bleiben nur in diesem Browser-Tab.</span></div><button className="text-button" onClick={() => window.location.reload()}><RefreshCw size={14} />Demo zurücksetzen</button></aside>}
          <div className="page-heading">
            <div>
              {view === "Heute" && <p className="eyebrow">
                {fmt(today(), {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>}
              <h1>{heading[view][0]}</h1>
              <p>{heading[view][1]}</p>
            </div>
            {(view === "Aufgaben" || (view === "Heute" && !!data?.topics.length)) && <button
              className={view === "Aufgaben" ? "primary" : "secondary"}
              disabled={!data}
              onClick={() => form("tasks")}
            >
              <Plus size={17} />
              Lernaufgabe
            </button>}
          </div>
          {error && (
            <div role="alert" className="error-box">
              <CircleAlert size={18} aria-hidden="true" />
              <p>{error}</p>
              <div className="error-actions">
                {error.includes("anmelden") && (
                  <a className="text-button" href="/login" target="_top">
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
                <button
                  className="icon-button small"
                  onClick={() => setError("")}
                  aria-label="Fehlermeldung schließen"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
          {!data && !error && (
            <div className="loading-state" aria-busy="true">
              <p role="status">Dein Semester wird geladen …</p>
              <div className="skeleton" /><div className="skeleton" /><div className="skeleton short" />
            </div>
          )}
          {data && (
            <>
              {view === "Heute" && <TodayView data={data} editTask={t=>form("tasks",t)} editSession={t=>form("sessions",undefined,{topicId:t.topicId,taskId:t.id,minutes:0})} openPlan={()=>navigate("Lernplan")} editPlan={(p,d)=>form("plans",p,d)} create={(entity)=>form(entity)}/>}
              {view === "Module" && (
                <>
                  {!mod(moduleId || "") && <div className="toolbar">
                    <div className="search-field">
                      <Search size={17} aria-hidden="true" />
                      <input
                        type="search"
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
                  </div>}
                  {!mod(moduleId || "") && !data.modules.length && <section className="panel"><Empty icon={BookOpen} text="Deine Module finden hier ihren Platz." action={() => form("modules")} label="Erstes Modul anlegen" /></section>}
                  {!mod(moduleId || "") && search && !data.modules.some(m => m.title.toLowerCase().includes(search.toLowerCase()) || data.topics.some(t => t.moduleId === m.id && t.title.toLowerCase().includes(search.toLowerCase()))) && <section className="panel"><Empty icon={Search} text="Keine passenden Module oder Themen gefunden." /></section>}
                  {!mod(moduleId || "") && (
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
                        .map((m) => {
                          const s = moduleStats(m.id);
                          const next = data.tasks
                            .filter((t) => t.status === "offen" && t.date >= today() && topic(t.topicId)?.moduleId === m.id)
                            .sort(taskOrder)[0];
                          const atRisk = risks(data).some((t) => t.moduleId === m.id);
                          return (
                          <button
                            className="panel module-card"
                            key={m.id}
                            style={{ "--module": m.color } as React.CSSProperties}
                            onClick={() => openModule(m.id)}
                          >
                            <div className="module-card-head">
                              <span className="module-code">{m.code}</span>
                              <span>{m.credits} ECTS</span>
                              <ArrowUpRight className="module-card-arrow" size={18} aria-hidden="true" />
                            </div>
                            <h2>{m.title}</h2>
                            <p className="module-exam">
                              <CalendarClock size={15} aria-hidden="true" />
                              {m.examDate ? `Klausur ${fmt(m.examDate)} · ${relativeDay(m.examDate)}` : "Klausurtermin offen"}
                            </p>
                            {s.total ? (
                              <EvidenceBar {...s} target={m.target} />
                            ) : (
                              <p className="module-empty">Noch keine Themen erfasst</p>
                            )}
                            <div className="module-card-foot">
                              {next ? (
                                <span><Clock3 size={14} aria-hidden="true" />Nächster Block {next.date === today() ? "heute" : fmt(next.date, { weekday: "short", day: "numeric", month: "short" })}, {next.time}</span>
                              ) : (
                                <span className="muted">Kein Lernblock geplant</span>
                              )}
                              {atRisk && <span className="badge amber"><TriangleAlert size={13} aria-hidden="true" />Plan prüfen</span>}
                            </div>
                          </button>
                          );
                        })}
                    </div>
                  )}
                  {moduleId && mod(moduleId) && (() => {
                    const m = mod(moduleId)!, s = moduleStats(moduleId), roadmap = moduleRoadmap(data, moduleId);
                    return (
                    <div className="module-detail" style={{ "--module": m.color } as React.CSSProperties}>
                      <button
                        className="back-link"
                        onClick={() => navigate("Module")}
                      >
                        <ChevronLeft size={17} aria-hidden="true" />
                        Alle Module
                      </button>
                      <header className="module-hero">
                        <div>
                          <span className="module-code">{m.code}</span>
                          <h2>{m.title}</h2>
                          <p>
                            {m.credits} ECTS · {m.examDate ? `Klausur am ${fmt(m.examDate, { weekday: "short", day: "numeric", month: "long" })} (${relativeDay(m.examDate)})` : "Klausurtermin offen"}
                          </p>
                        </div>
                        <div className="module-hero-actions">
                          <button
                            className="secondary"
                            onClick={() => form("modules", m)}
                          >
                            <Pencil size={15} />
                            Modul bearbeiten
                          </button>
                          <button
                            className="primary"
                            onClick={() =>
                              form("topics", undefined, { moduleId })
                            }
                          >
                            <Plus size={16} />
                            Thema
                          </button>
                        </div>
                      </header>
                      <section className="panel evidence-panel" aria-label="Lernstand">
                        <div className="evidence-figure">
                          <b>{s.total ? `${progress(data, moduleId)} %` : "–"}</b>
                          <span>selbstständig bestätigt · Ziel {m.target} %</span>
                        </div>
                        <div className="evidence-main">
                          {s.total ? <EvidenceBar {...s} target={m.target} /> : <p className="module-empty">Noch keine Themen angelegt.</p>}
                          <p className="evidence-rule">
                            Bestätigt heißt: Status „sicher“ und neuester Selbsttest ab 80 % ohne Hilfe. Bearbeitete Themen zählen noch nicht.
                            {!!roadmap.unplannedTopicIds.length && ` ${roadmap.unplannedTopicIds.length} ${roadmap.unplannedTopicIds.length === 1 ? "Thema ist" : "Themen sind"} noch ungeplant.`}
                          </p>
                        </div>
                      </section>
                      {m.learningNotes && <details className="panel learning-note" open={m.learningNotes.length < 320}>
                        <summary>Lernnotiz <span>Regeln und Beobachtungen für dieses Fach</span></summary>
                        <p>{m.learningNotes}</p>
                      </details>}
                      <nav className="section-jumps" aria-label="In diesem Modul">
                        <a href="#topics-heading">Themen <span className="count">{s.total}</span></a>
                        <a href="#materials-heading">Materialien</a>
                      </nav>
                      <div className="module-columns">
                        <TopicOverview data={data} moduleId={moduleId} search={search} setSearch={setSearch} editTopic={t=>form("topics",t)} testTopic={t=>form("tests",undefined,{topicId:t.id})} addTopic={()=>form("topics",undefined,{moduleId})}/>
                        <MaterialsPanel key={moduleId} moduleId={moduleId} revision={revision} onChange={() => { void refresh(); }} />
                      </div>
                    </div>
                    );
                  })()}
                </>
              )}
              {view === "Aufgaben" && (() => {
                const visible = data.tasks.filter(
                  (t) =>
                    (filter === "alle" || t.status === filter) &&
                    t.title.toLowerCase().includes(search.toLowerCase()),
                );
                const dates = Array.from(new Set(visible.map((t) => t.date))).sort();
                return (
                <>
                  <div className="toolbar">
                    <div className="segmented" role="group" aria-label="Aufgaben filtern">
                      {["offen", "erledigt", "alle"].map((f) => (
                        <button
                          className={filter === f ? "selected" : ""}
                          aria-pressed={filter === f}
                          key={f}
                          onClick={() => setFilter(f)}
                        >
                          {f === "offen"
                            ? "Offen"
                            : f === "erledigt"
                              ? "Bearbeitet"
                              : "Alle"}
                          <span className="count">{data.tasks.filter((t) => f === "alle" || t.status === f).length}</span>
                        </button>
                      ))}
                    </div>
                    <div className="search-field">
                      <Search size={17} aria-hidden="true" />
                      <input
                        type="search"
                        aria-label="Aufgaben suchen"
                        placeholder="Aufgaben suchen …"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  {filter !== "offen" && <p className="inline-note"><CircleDot size={15} aria-hidden="true" />Bearbeitet heißt nicht beherrscht. Den Nachweis liefert ein Selbsttest.</p>}
                  <div className="day-groups">
                  {dates.map((date) => {
                    const rows = visible
                      .filter((t) => t.date === date)
                      .sort((a, b) => a.time.localeCompare(b.time));
                    const overdue = date < today() && rows.some((t) => t.status === "offen");
                    return (
                      <section className="panel day-group" key={date} aria-labelledby={`day-${date}`}>
                        <div className="day-group-head">
                          <h2 id={`day-${date}`}>
                            {date === today()
                              ? "Heute"
                              : fmt(date, {
                                  weekday: "long",
                                  day: "numeric",
                                  month: "long",
                                })}
                          </h2>
                          <span className="subtle">{rows.length} {rows.length === 1 ? "Block" : "Blöcke"} · {duration(rows.reduce((n, t) => n + t.minutes, 0))}</span>
                          {overdue && (
                            <span className="badge amber">
                              <TriangleAlert size={13} aria-hidden="true" />
                              Offen seit {relativeDay(date).replace("vor ", "")}
                            </span>
                          )}
                        </div>
                        {rows.map(taskRow)}
                      </section>
                    );
                  })}
                  </div>
                  {!visible.length && (
                    <section className="panel">
                      <Empty
                        icon={ListTodo}
                        text={search ? "Keine Aufgaben passen zu deiner Suche." : filter === "offen" ? "Keine offenen Lernaufgaben." : "Noch keine Aufgaben in dieser Auswahl."}
                        action={() => form("tasks")}
                        label="Aufgabe hinzufügen"
                      />
                    </section>
                  )}
                </>
                );
              })()}
              {view === "Lernplan" && (
                <>
                  <div className="toolbar">
                    <div className="segmented" role="group" aria-label="Zeitraum">
                      {["Tag", "Woche", "Semester"].map((v) => (
                        <button
                          key={v}
                          className={planView === v ? "selected" : ""}
                          aria-pressed={planView === v}
                          onClick={() => setPlanView(v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    {planView !== "Semester" && <div className="date-controls">
                      <button
                        className="icon-button"
                        aria-label={planView === "Woche" ? "Vorherige Woche" : "Vorheriger Tag"}
                        onClick={() =>
                          planView === "Woche"
                            ? setWeek(offsetDate(week, -7))
                            : setSelectedDate(offsetDate(selectedDate, -1))
                        }
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <b aria-live="polite">
                        {planView === "Woche"
                          ? `${fmt(week)} – ${fmt(offsetDate(week, 6))}`
                          : fmt(selectedDate, {
                              weekday: "short",
                              day: "numeric",
                              month: "long",
                            })}
                      </b>
                      <button
                        className="icon-button"
                        aria-label={planView === "Woche" ? "Nächste Woche" : "Nächster Tag"}
                        onClick={() =>
                          planView === "Woche"
                            ? setWeek(offsetDate(week, 7))
                            : setSelectedDate(offsetDate(selectedDate, 1))
                        }
                      >
                        <ChevronRight size={18} />
                      </button>
                      {(planView === "Woche" ? week !== monday(today()) : selectedDate !== today()) && (
                        <button className="text-button" onClick={() => { setWeek(monday(today())); setSelectedDate(today()); }}>
                          Heute
                        </button>
                      )}
                    </div>}
                    <button
                      className="secondary toolbar-end"
                      onClick={() =>
                        setProposal({ ...proposeWeek(data), revision })
                      }
                    >
                      <CalendarRange size={16} />
                      Nächste Woche planen
                    </button>
                  </div>
                  {planView !== "Semester" && <WeekBudget data={data} start={planView === "Tag" ? monday(selectedDate) : week} showDays={planView === "Tag"} editPlan={(p,d)=>form("plans",p,d)}/>}
                  {planView === "Semester" ? <SemesterFrame data={data} editTopic={t=>form("topics",t)} editPlan={p=>form("plans",p)}/> : planView === "Woche" ? (
                    <div className="week-grid">
                      {Array.from({ length: 7 }, (_, i) => {
                        const date = offsetDate(week, i),
                          tasks = data.tasks
                            .filter((t) => t.date === date)
                            .sort((a, b) => a.time.localeCompare(b.time)),
                          minutes = tasks.reduce((n, t) => n + t.minutes, 0);
                        return (
                          <section
                            className={
                              "day-column " +
                              (date === today() ? "is-today " : "") +
                              (date < today() ? "is-past" : "")
                            }
                            key={date}
                            aria-label={fmt(date, { weekday: "long", day: "numeric", month: "long" })}
                          >
                            <div className="day-heading">
                              <span>{fmt(date, { weekday: "short" })}</span>
                              <b>{fmt(date, { day: "numeric" })}</b>
                              {date === today() && <em>Heute</em>}
                              <small>{minutes ? `${hours(minutes)} Std.` : "frei"}</small>
                            </div>
                            <div className="day-tasks">
                            {tasks.map((t) => (
                              <button
                                className={
                                  "calendar-task " +
                                  (t.status === "erledigt" ? "completed" : "")
                                }
                                style={{ "--module": topicModule(t.topicId)?.color } as React.CSSProperties}
                                key={t.id}
                                title={t.title}
                                onClick={() => form("tasks", t)}
                              >
                                <span className="calendar-time">
                                  {t.status === "erledigt" && <Check size={13} aria-label="Bearbeitet" />}
                                  {t.time} · {t.minutes} Min.
                                </span>
                                <b className="short-task-title">{t.title}</b>
                                <small>
                                  {topicModule(t.topicId)?.code}{t.kind !== "Lernen" ? ` · ${t.kind}` : ""}
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
                              <Plus size={16} aria-hidden="true" />
                              <span>Block</span>
                            </button>
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  ) : (
                    <section className="panel day-group">
                      <div className="day-group-head">
                        <h2>{selectedDate === today() ? "Heute" : fmt(selectedDate, { weekday: "long", day: "numeric", month: "long" })}</h2>
                        <span className="subtle">{hours(data.tasks.filter((t) => t.date === selectedDate).reduce((n, t) => n + t.minutes, 0))} Std. geplant</span>
                      </div>
                      {data.tasks
                        .filter((t) => t.date === selectedDate)
                        .sort((a, b) => a.time.localeCompare(b.time))
                        .map(taskRow)}
                      {!data.tasks.some((t) => t.date === selectedDate) && (
                        <Empty
                          icon={CalendarDays}
                          text="An diesem Tag ist noch nichts geplant."
                          action={() =>
                            form("tasks", undefined, { date: selectedDate })
                          }
                          label="Lernblock planen"
                        />
                      )}
                    </section>
                  )}
                  <details className="panel disclosure plan-history">
                    <summary><History size={17} aria-hidden="true" />Letzte Planänderungen <span className="count">{audit.filter(a=>["tasks","plans","topics"].includes(a.entity)).slice(0,12).length}</span><ChevronDown className="chevron" size={18} aria-hidden="true" /></summary>
                    {!audit.some(a=>["tasks","plans","topics"].includes(a.entity)) && <p className="disclosure-empty">Noch keine Planänderungen gespeichert.</p>}
                    {audit.filter(a=>["tasks","plans","topics"].includes(a.entity)).slice(0,12).map(a=><div className="audit-row" key={a.id}><div><b>{a.reason || "Kein Grund dokumentiert"}</b><p>{fmt(a.date)} · {a.actor} · {entityLabel[a.entity] || a.entity} {actionLabel(a.action).toLowerCase()}</p></div><details className="audit-json"><summary>Änderung ansehen</summary><pre>{JSON.stringify({vorher:a.before?JSON.parse(a.before):null,nachher:a.after?JSON.parse(a.after):null},null,2)}</pre></details></div>)}
                  </details>
                </>
              )}
              {view === "Wiederholungen" && (
                <>
                  <div className="toolbar">
                    <p className="toolbar-summary">
                      <b>{due.length}</b> fällig
                      {data.reviews.some((r) => r.status === "offen" && r.date < today()) && <> · <b>{data.reviews.filter((r) => r.status === "offen" && r.date < today()).length}</b> überfällig</>}
                      {" "}· {data.reviews.filter((r) => r.status === "erledigt").length} abgeschlossen
                    </p>
                    <button
                      className="secondary toolbar-end"
                      onClick={() => form("reviews")}
                    >
                      <Plus size={16} />
                      Wiederholung planen
                    </button>
                  </div>
                  <p className="inline-note">
                    <Repeat2 size={15} aria-hidden="true" />
                    „Wiederholt“ plant den nächsten Termin im hinterlegten Abstand. Einen Wissensnachweis erfasst du über einen Selbsttest.
                  </p>
                  <section className="panel list-panel">
                    {data.reviews
                      .filter((r) => r.status === "offen")
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((r) => {
                        const m = topicModule(r.topicId);
                        return (
                        <div className="list-row review-row" key={r.id} style={{ "--module": m?.color } as React.CSSProperties}>
                          <span className="row-icon" aria-hidden="true">
                            <Repeat2 size={18} />
                          </span>
                          <div className="grow">
                            <button
                              className="row-title"
                              onClick={() => form("reviews", r)}
                            >
                              {topic(r.topicId)?.title}
                            </button>
                            <p>
                              {m?.title} · alle {r.interval} Tage
                            </p>
                          </div>
                          <span
                            className={
                              "badge " +
                              (r.date < today()
                                ? "amber"
                                : r.date === today()
                                  ? "brand"
                                  : "gray")
                            }
                          >
                            {r.date < today() && <TriangleAlert size={13} aria-hidden="true" />}
                            {r.date === today() ? "Heute fällig" : r.date < today() ? `Fällig seit ${fmt(r.date)}` : `${fmt(r.date)} · ${relativeDay(r.date)}`}
                          </span>
                          <button
                            className="secondary compact"
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
                        );
                      })}
                    {!data.reviews.some((r) => r.status === "offen") && (
                      <Empty icon={Repeat2} text="Keine offenen Wiederholungen." action={() => form("reviews")} label="Wiederholung planen" />
                    )}
                  </section>
                </>
              )}
              {view === "Wissensstand" && (() => {
                const neglected = risks(data).filter(
                  (t) => !!t.lastPracticed && t.lastPracticed < offsetDate(today(), -10),
                );
                const knowledgeTabs: [string, number][] = [
                  ["Wissenslücken", data.gaps.filter((g) => g.status === "offen").length],
                  ["Selbsttests", data.tests.length],
                  ["Beherrscht", data.topics.filter((t) => mastered(data, t)).length],
                  ["Verlauf", data.history.length],
                  ["Lernzeit", data.sessions.length],
                ];
                return (
                <>
                  <div className="toolbar">
                    <div className="tabs" role="tablist" aria-label="Wissensstand">
                      {knowledgeTabs.map(([v, n]) => (
                        <button
                          key={v}
                          role="tab"
                          aria-selected={knowledgeTab === v}
                          className={knowledgeTab === v ? "selected" : ""}
                          onClick={() => setKnowledgeTab(v)}
                        >
                          {v}
                          <span className="count">{n}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      className="secondary toolbar-end"
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
                      {!data.gaps.length && <section className="panel"><Empty icon={CircleDot} text="Noch keine Wissenslücken erfasst. Halte hier fest, was beim Üben unklar bleibt." action={() => form("gaps")} label="Wissenslücke festhalten" /></section>}
                      <div className="gap-grid">
                        {[...data.gaps].sort((a, b) => (a.status === b.status ? b.date.localeCompare(a.date) : a.status === "offen" ? -1 : 1)).map((g) => (
                          <article className={"panel gap-card " + (g.status === "offen" ? "" : "is-closed")} key={g.id} style={{ "--module": topicModule(g.topicId)?.color } as React.CSSProperties}>
                            <div className="gap-card-top">
                              <span className={"badge " + (g.status === "offen" ? "brand" : "gray")}>
                                {g.status === "offen" ? <CircleDot size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
                                {g.status === "offen" ? "Offen" : "Geschlossen"}
                              </span>
                              <span className="subtle">{fmt(g.date)}</span>
                              <button
                                className="icon-button small"
                                aria-label={`Wissenslücke „${g.description}“ bearbeiten`}
                                onClick={() => form("gaps", g)}
                              >
                                <Pencil size={15} />
                              </button>
                            </div>
                            <p className="gap-description">{g.description}</p>
                            <p className="gap-topic"><i className="module-dot" style={{ background: topicModule(g.topicId)?.color }} />{topic(g.topicId)?.title}</p>
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
                          </article>
                        ))}
                      </div>
                      {!!neglected.length && <section className="panel list-panel spaced-panel">
                        <div className="panel-head">
                          <div>
                            <h2>
                              <TriangleAlert size={17} className="warn-icon" aria-hidden="true" />
                              Länger nicht geübt
                            </h2>
                            <p>Überfälliger Plan und letzte Übung vor mehr als 10 Tagen.</p>
                          </div>
                        </div>
                        {neglected.map((t) => (
                            <div className="list-row" key={t.id}>
                              <div className="grow">
                                <b className="short-task-title">{t.title}</b>
                                <p>
                                  {mod(t.moduleId)?.title} · zuletzt {fmt(t.lastPracticed!)}
                                </p>
                              </div>
                              <button
                                className="secondary compact"
                                onClick={() =>
                                  form("tasks", undefined, {
                                    topicId: t.id,
                                    title: t.title + " selbstständig üben",
                                    priority: t.priority,
                                  })
                                }
                              >
                                <Plus size={14} /> Einplanen
                              </button>
                            </div>
                          ))}
                      </section>}
                    </>
                  )}
                  {knowledgeTab === "Selbsttests" && (
                    <section className="panel">
                      {!!data.tests.length && <table className="data-table">
                        <thead>
                          <tr>
                            <th scope="col">Thema</th>
                            <th scope="col">Ergebnis</th>
                            <th scope="col">Ohne Hilfe</th>
                            <th scope="col">Datum</th>
                            <th scope="col">Notiz</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...data.tests]
                            .sort((a, b) => b.date.localeCompare(a.date))
                            .map((t) => (
                              <tr key={t.id}>
                                <td data-label="Thema">
                                  <button
                                    className="row-title"
                                    onClick={() => form("tests", t)}
                                  >
                                    {topic(t.topicId)?.title}
                                  </button>
                                  <small className="cell-sub">{topicModule(t.topicId)?.title}</small>
                                </td>
                                <td data-label="Ergebnis">
                                  <span className="score">{t.score} %</span>
                                  {t.score >= 80 && t.independent && <span className="badge green"><CircleCheck size={13} aria-hidden="true" />Nachweisfähig</span>}
                                </td>
                                <td data-label="Ohne Hilfe">{t.independent ? "Ja" : "Nein"}</td>
                                <td data-label="Datum">{fmt(t.date)}</td>
                                <td data-label="Notiz" className="cell-note">{t.notes || "–"}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>}
                      {!data.tests.length && (
                        <Empty icon={CircleCheck} text="Noch keine Selbsttests erfasst." action={() => form("tests")} label="Selbsttest erfassen" />
                      )}
                    </section>
                  )}
                  {knowledgeTab === "Beherrscht" && (
                    <>
                      <p className="inline-note">
                        <CircleCheck size={15} aria-hidden="true" />
                        Status „sicher“ und neuester Selbsttest ab 80 % ohne Hilfe. Der Nachweis bezieht sich auf den gespeicherten Testzeitpunkt.
                      </p>
                      <section className="panel list-panel">
                        {!data.topics.some(t => mastered(data, t)) && <Empty icon={CircleCheck} text="Noch kein Thema nachgewiesen. Ein Selbsttest ohne Hilfe macht deinen Lernstand sichtbar." action={() => form("tests")} label="Selbsttest erfassen" />}
                        {data.topics
                          .filter((t) => mastered(data, t))
                          .map((t) => (
                            <div className="list-row" key={t.id}>
                              <span className="stage-icon is-confirmed" aria-hidden="true"><CircleCheck size={19} /></span>
                              <div className="grow">
                                <b className="short-task-title">{t.title}</b>
                                <p>{mod(t.moduleId)?.title}</p>
                              </div>
                              <span className="badge green">
                                Selbstständig bestätigt
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
                    <section className="panel list-panel">
                      <div className="panel-head">
                        <div>
                          <h2>Dein Wissensverlauf</h2>
                          <p>
                            Änderungen der Selbsteinschätzung. Testergebnisse findest du unter Selbsttests.
                          </p>
                        </div>
                      </div>
                      {!data.history.length && <Empty icon={History} text="Sobald sich ein Themenstatus ändert, siehst du hier deinen Verlauf." />}
                      {[...data.history]
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((h) => (
                          <div className="list-row" key={h.id}>
                            <span className="row-icon neutral" aria-hidden="true">
                              <History size={16} />
                            </span>
                            <div className="grow">
                              <b>{topic(h.topicId)?.title}</b>
                              <p>
                                {h.source} · {fmt(h.date)}
                              </p>
                            </div>
                            <span className="badge gray">
                              Selbsteinschätzung: {h.status}
                            </span>
                          </div>
                        ))}
                    </section>
                  )}
                  {knowledgeTab === "Lernzeit" && (
                    <section className="panel list-panel">
                      <div className="panel-head">
                        <div>
                          <h2>
                            {hours(
                              data.sessions.reduce((s, t) => s + t.minutes, 0),
                            )}{" "}
                            Stunden dokumentiert
                          </h2>
                          <p>Tatsächlich erfasste Lernzeit.{data.sessions.some((s) => !s.minutes) && ` ${data.sessions.filter((s) => !s.minutes).length} Einträge ohne Zeitangabe werden nicht geschätzt.`}</p>
                        </div>
                      </div>
                      {!data.sessions.length && <Empty icon={Clock3} text="Noch keine Lernzeit erfasst." action={() => form("sessions")} label="Lernzeit eintragen" />}
                      {[...data.sessions]
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((s) => (
                          <div className="list-row" key={s.id}>
                            <span className="row-icon neutral" aria-hidden="true"><Clock3 size={16} /></span>
                            <div className="grow">
                              <button
                                className="row-title"
                                onClick={() => form("sessions", s)}
                              >
                                {topic(s.topicId)?.title}
                              </button>
                              <p>
                                {fmt(s.date)}{s.assistance && s.assistance !== "unbekannt" ? ` · ${s.assistance}` : ""}{s.notes ? ` · ${s.notes}` : ""}
                              </p>
                            </div>
                            <b className="row-figure">{s.minutes ? `${s.minutes} Min.` : <span className="muted">Zeit unbekannt</span>}</b>
                          </div>
                        ))}
                    </section>
                  )}
                </>
                );
              })()}
              {view === "Termine" && (
                <>
                  <div className="toolbar">
                    <p className="toolbar-summary"><b>{data.deadlines.filter((d) => d.date >= today()).length}</b> anstehend · {data.deadlines.length} insgesamt</p>
                    <button
                      className="secondary toolbar-end"
                      onClick={() => form("deadlines")}
                    >
                      <Plus size={16} />
                      Termin hinzufügen
                    </button>
                  </div>
                  <section className="panel list-panel">
                    {!data.deadlines.length && <Empty icon={CalendarClock} text="Noch keine Klausuren oder Abgaben eingetragen." action={() => form("deadlines")} label="Termin hinzufügen" />}
                    {[...data.deadlines]
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((d) => (
                        <div className={"list-row deadline-row " + (d.date < today() ? "is-past" : "")} key={d.id} style={{ "--module": mod(d.moduleId)?.color } as React.CSSProperties}>
                          <span className="date-tile" aria-hidden="true">
                            <small>
                              {fmt(d.date, { month: "short" }).replace(".", "")}
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
                              <i className="module-dot" style={{ background: mod(d.moduleId)?.color }} />
                              {mod(d.moduleId)?.title} ·{" "}
                              {fmt(d.date, {
                                weekday: "long",
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              })}
                            </p>
                          </div>
                          <span className="deadline-when">{relativeDay(d.date)}</span>
                          <span className="badge gray">
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
                    <span className="work-icon" aria-hidden="true"><Plug size={22} /></span>
                    <div>
                      <h2>Mit ChatGPT Work lernen</h2>
                      <p>Verbinde dein Cockpit über die MCP-Adresse mit ChatGPT Work. Du meldest dich an und gibst den Zugriff frei. Danach kann Work Lernstände lesen und Pläne direkt speichern.</p>
                      <blockquote>„Analysiere meinen Semesterstand und plane meine nächste Lernwoche.“</blockquote>
                      <div className="button-row">
                        <button className="primary" onClick={() => navigator.clipboard.writeText(window.location.origin + "/api/mcp").then(() => setToast("MCP-Adresse kopiert.")).catch(() => setError("Kopieren ist im Browser gesperrt. Adresse: " + window.location.origin + "/api/mcp"))}><Copy size={16} />MCP-Adresse kopieren</button>
                        <a className="secondary" href="/connections">Verbindungen verwalten</a>
                      </div>
                      <p className="subtle">Ergänze zuerst deine Module und Themen – oder beauftrage ChatGPT damit.</p>
                    </div>
                  </section>
                  <details className="panel disclosure spaced-panel">
                    <summary><KeyRound size={17} aria-hidden="true" />Weitere Agenten & API-Zugänge<ChevronDown className="chevron" size={18} aria-hidden="true" /></summary>
                  <div className="integration-grid">
                    <section className="panel">
                      <div className="panel-head">
                        <h2>Agent-Schlüssel</h2>
                      </div>
                      <div className="panel-content">
                        <p>
                          Persönlicher Schlüssel für einen Agenten. Gilt 90 Tage und lässt sich jederzeit widerrufen.
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
                          className="secondary"
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
                            <div className="button-row">
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
                                className="text-button danger-text"
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
                        <h2>Schnittstellen</h2>
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
                          Andere API-Clients können einen widerrufbaren Agent-Schlüssel verwenden. Alle Zugriffe arbeiten mit denselben Lerndaten.
                        </p>
                        <div className="button-row">
                          <a
                            className="secondary compact"
                            href="/api/v1/openapi.json"
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink size={15} />
                            OpenAPI
                          </a>
                          <a
                            className="secondary compact"
                            href="/agent-guide.md"
                            target="_blank"
                            rel="noreferrer"
                          >
                            <BookOpen size={15} />
                            Anleitung
                          </a>
                          <a
                            className="secondary compact"
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
                  <section className="panel list-panel spaced-panel">
                    <div className="panel-head">
                      <div>
                        <h2>Änderungsprotokoll</h2>
                        <p>Letzte 30 Änderungen · aktuelle Revision {revision}</p>
                      </div>
                    </div>
                    {audit.length ? (
                      audit.slice(0, 30).map((a) => (
                        <div className="list-row audit-row" key={a.id}>
                          <span className="row-icon neutral" aria-hidden="true">
                            <History size={16} />
                          </span>
                          <div className="grow">
                            <b>
                              {entityLabel[a.entity] || a.entity} {actionLabel(a.action).toLowerCase()}{a.reason ? ` · ${a.reason}` : ""}
                            </b>
                            <p>
                              {a.actor} · {new Date(a.date).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })} · Revision {a.revision}
                            </p>
                          </div>
                          <details className="audit-json">
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
                      <Empty icon={History} text="Noch keine Änderungen gespeichert." />
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
          <CheckCircle2 size={18} aria-hidden="true" />
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
              const createdModule = snapshotRef.current.data?.modules.find(m => m.id === value.id);
              if (createdModule) openModule(createdModule.id); else navigate("Module");
            }
          }}
        />
      )}
      {proposal && (
        <Modal
          title="Deine nächste Lernwoche"
          onClose={() => setProposal(null)}
        >
          <div className="modal-body">
            <span className="badge gray">
              Regelbasierter Vorschlag · keine KI verbunden
            </span>
            <h3 className="proposal-range">
              {fmt(proposal.plan.startDate)} – {fmt(proposal.plan.endDate)}
            </h3>
            <p className="form-hint">{proposal.plan.notes}</p>
            <p className="proposal-total">
              <b>
                {proposal.tasks.length} neue Blöcke ·{" "}
                {hours(proposal.tasks.reduce((n, t) => n + t.minutes, 0))}{" "}
                Std.
              </b>
            </p>
            {!proposal.tasks.length && <p className="form-hint">Innerhalb der vorhandenen Budgets ist keine freie Zeit mehr verfügbar. Budgets werden hier nicht erhöht.</p>}
            <div className="proposal-list">
              {proposal.tasks.map((t) => (
                <div key={t.id}>
                  <span>
                    {fmt(t.date, { weekday: "short", day: "numeric", month: "short" })} · {t.time}
                  </span>
                  <b className="short-task-title">{t.title}</b>
                  <small>{t.minutes} Min.</small>
                </div>
              ))}
            </div>
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
        </Modal>
      )}
    </div>
  );
}
function Empty({
  text,
  action,
  label,
  icon: Icon = BookOpen,
}: {
  text: string;
  action?: () => void;
  label?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true"><Icon size={22} /></span>
      <p>{text}</p>
      {action && (
        <button className="secondary compact" onClick={action}>
          <Plus size={15} />
          {label}
        </button>
      )}
    </div>
  );
}

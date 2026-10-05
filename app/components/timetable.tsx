"use client";
import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, Plus, BookOpen, GraduationCap, Clock3 } from "lucide-react";
import { monday, offsetDate, today, type Snapshot, type Task } from "@/lib/model";
import { timetableBlocks, layoutBlocks, overlaps, timeMinutes, wallEnd, isSeriesDate } from "@/lib/timetable";
import type { TimetableBlock, TimetableEvent } from "@/lib/timetable-model";
import type { Operation } from "@/lib/validation";
import { Modal } from "./editor";
import "./timetable.css";

type Writer = (ops: Operation[], message?: string, revision?: number, key?: string, reason?: string, moduleScope?: string) => Promise<unknown>;
type Props = { data: Snapshot; revision: number; busy: boolean; write: Writer; openTask: (task: Task) => void; openModule: (id: string) => void };
const fmt = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("de-DE", { ...options, timeZone: "Europe/Berlin" }).format(new Date(date + "T12:00:00Z"));
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const px = 1.05;
type Editing = { block?: TimetableBlock; event?: TimetableEvent; date: string; time: string; revision: number };
type Drag = { block: TimetableBlock; mode: "move" | "resize"; x: number; y: number; revision: number; moved: boolean; date: string; time: string; minutes: number };

export function Timetable(p: Props) {
  const [date, setDate] = useState(today), [filter, setFilter] = useState(""), [weekends, setWeekends] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null), [error, setError] = useState(""), [ghost, setGhost] = useState<Drag | null>(null);
  const drag = useRef<Drag | null>(null), suppressClick = useRef(false), cells = useRef<Record<string, HTMLDivElement | null>>({});
  const start = monday(date), end = offsetDate(start, 7);
  const blocks = useMemo(() => timetableBlocks(p.data, start, end), [p.data, start, end]);
  const visible = blocks.filter(b => !filter || b.moduleId === filter);
  const days = Array.from({ length: 7 }, (_, i) => offsetDate(start, i));
  const conflicts = blocks.flatMap((a, i) => blocks.slice(i + 1).filter(b => overlaps(a, b)).map(b => [a, b]));
  const hasWeekend = visible.some(b => b.start.slice(0, 10) >= days[5]);
  const showWeekend = weekends || hasWeekend;
  const hours = visible.reduce((r, b) => {
    const s = timeMinutes(b.start.slice(11)), e = b.start.slice(0, 10) === b.end.slice(0, 10) ? timeMinutes(b.end.slice(11)) : 1440;
    return [Math.min(r[0], b.start.slice(0, 10) !== b.end.slice(0, 10) ? 0 : Math.floor(s / 60)), Math.max(r[1], Math.ceil(e / 60))];
  }, [7, 21]);
  const gridStart = hours[0] * 60, gridEnd = hours[1] * 60, height = (gridEnd - gridStart) * px;
  const open = (block: TimetableBlock) => {
    setError(""); setEditing({ block, event: p.data.timetableEvents?.find(e => e.id === block.sourceId), date: block.start.slice(0, 10), time: block.start.slice(11), revision: p.revision });
  };
  const newEvent = (day = date, time = "09:00") => { setError(""); setEditing({ date: day, time, revision: p.revision }); };
  const begin = (ev: PointerEvent<HTMLElement>, block: TimetableBlock, mode: Drag["mode"]) => {
    if (ev.button !== 0 || ev.pointerType === "touch" || p.busy || block.start.slice(0, 10) !== block.end.slice(0, 10)) return;
    ev.stopPropagation(); ev.currentTarget.setPointerCapture(ev.pointerId);
    const minutes = (Date.parse(block.end + ":00Z") - Date.parse(block.start + ":00Z")) / 60000;
    drag.current = { block, mode, x: ev.clientX, y: ev.clientY, revision: p.revision, moved: false, date: block.start.slice(0, 10), time: block.start.slice(11), minutes };
  };
  const move = (ev: PointerEvent<HTMLElement>) => {
    const d = drag.current; if (!d) return;
    if (!d.moved && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 6) return;
    const day = Object.entries(cells.current).find(([, el]) => { const r = el?.getBoundingClientRect(); return r && r.width > 0 && ev.clientX >= r.left && ev.clientX <= r.right; })?.[0];
    if (!day) return;
    const delta = Math.round((ev.clientY - d.y) / px / 15) * 15;
    const s = timeMinutes(d.block.start.slice(11));
    const minutes = d.mode === "resize" ? Math.min(720, Math.max(15, (Date.parse(d.block.end + ":00Z") - Date.parse(d.block.start + ":00Z")) / 60000 + delta)) : d.minutes;
    const m = Math.min(1440 - minutes, Math.max(0, s + (d.mode === "move" ? delta : 0)));
    drag.current = { ...d, moved: true, date: d.mode === "resize" ? d.block.start.slice(0, 10) : day, time: hhmm(m), minutes };
    setGhost(drag.current);
  };
  const finish = async () => {
    const d = drag.current; drag.current = null; setGhost(null);
    if (!d?.moved) return;
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    const block = d.block;
    const event = p.data.timetableEvents?.find(e => e.id === block.sourceId);
    const ops: Operation[] = block.kind === "Lernzeit" ? [{ entity: "tasks", action: "update", id: block.sourceId, data: { date: d.date, time: d.time, minutes: d.minutes } }] : event ? [{ entity: "timetableEvents", action: "update", id: event.id, data: event.intervalWeeks ? {
      exceptions: [...event.exceptions.filter(e => e.originalDate !== block.originalDate), { originalDate: block.originalDate, date: d.date, time: d.time, minutes: d.minutes, location: block.location, cancelled: false }],
    } : { date: d.date, time: d.time, minutes: d.minutes } }] : [];
    if (!ops.length) return;
    try { await p.write(ops, "Zeit geändert.", d.revision, crypto.randomUUID(), "Im Stundenplan verschoben oder Dauer geändert", block.kind === "Lernzeit" ? block.moduleId : undefined); setError(""); }
    catch (e) { setError((e as Error).message); }
  };
  return <section className="tt" aria-label="Stundenplan">
    <div className="tt-toolbar">
      <div className="tt-period"><button className="icon-button" aria-label="Vorherige Woche" onClick={() => setDate(offsetDate(date, -7))}><ChevronLeft size={18}/></button><b>{fmt(start, { day: "numeric", month: "short" })} – {fmt(offsetDate(end, -1), { day: "numeric", month: "short", year: "numeric" })}</b><button className="icon-button" aria-label="Nächste Woche" onClick={() => setDate(offsetDate(date, 7))}><ChevronRight size={18}/></button><button className="tt-button" onClick={() => setDate(today())}>Heute</button></div>
      <div className="tt-tools"><label className="tt-filter">Modul<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">Alle Module</option>{p.data.modules.map(m => <option value={m.id} key={m.id}>{m.title}</option>)}</select></label><label className="tt-weekend"><input type="checkbox" checked={showWeekend} disabled={hasWeekend} onChange={e => setWeekends(e.target.checked)}/>Wochenende</label><button className="tt-button primary" disabled={p.busy || !p.data.modules.length} onClick={() => newEvent()}><Plus size={16}/>Veranstaltung</button></div>
    </div>
    <div className="tt-legend"><span className="tt-legend-event"><GraduationCap size={15} aria-hidden="true"/>Vorlesung / Übung</span><span className="tt-legend-study"><BookOpen size={15} aria-hidden="true"/>Lernzeit</span><p>Lerninhalte findest du im Lernplan und im Modul.</p></div>
    {error && <p className="tt-warning" role="alert">{error}</p>}
    {conflicts.length > 0 && <details className="tt-warning"><summary>{conflicts.length} zeitliche Überschneidung{conflicts.length > 1 ? "en" : ""}</summary>{conflicts.map(([a, b]) => <p key={a.id + b.id}>{fmt(a.start.slice(0, 10), { weekday: "short", day: "numeric", month: "short" })}: {a.title} ({a.kind}) und {b.title} ({b.kind})</p>)}</details>}
    {!visible.length && <p className="tt-empty">Noch keine Einträge für diese Woche{filter ? " und dieses Modul" : ""}. Veranstaltungen kannst du hier anlegen; geplante Lernblöcke erscheinen automatisch.</p>}
    <div className="tt-mobile-days" aria-label="Tag auswählen">{days.map(day => <button key={day} className={day === date ? "selected" : ""} aria-pressed={day === date} onClick={() => setDate(day)}>{fmt(day, { weekday: "short" })}<b>{day.slice(8)}</b></button>)}</div>
    <div className="tt-grid" style={{ "--tt-days": showWeekend ? 7 : 5 } as CSSProperties}>
      <div className="tt-gutter"><div className="tt-day-title"/><div style={{ height }} className="tt-hours">{Array.from({ length: hours[1] - hours[0] }, (_, i) => hours[0] + i).map(h => <span key={h} style={{ top: (h * 60 - gridStart) * px }}>{hhmm(h * 60)}</span>)}</div></div>
      {days.map((day, index) => {
        const dayItems = visible.filter(b => b.start < offsetDate(day, 1) + "T00:00" && b.end > day + "T00:00");
        const clipped = dayItems.map(b => ({ ...b, start: b.start < day + "T00:00" ? day + "T00:00" : b.start, end: b.end > offsetDate(day, 1) + "T00:00" ? offsetDate(day, 1) + "T00:00" : b.end }));
        const layout = layoutBlocks(clipped);
        return <div key={day} className={`tt-day ${day === today() ? "is-today" : ""} ${day === date ? "is-selected" : ""} ${index > 4 && !showWeekend ? "is-weekend-hidden" : ""}`}>
          <div className="tt-day-title"><span>{fmt(day, { weekday: "short" })}</span><b>{fmt(day, { day: "numeric", month: "short" })}</b></div>
          <div className="tt-day-body" ref={el => { cells.current[day] = el; }} style={{ height }}>
            {Array.from({ length: hours[1] - hours[0] }, (_, i) => <button key={i} className="tt-free" disabled={p.busy} style={{ top: i * 60 * px, height: 60 * px }} aria-label={`Veranstaltung am ${fmt(day, { weekday: "long", day: "numeric", month: "long" })} um ${hhmm(gridStart + i * 60)} anlegen`} onClick={() => newEvent(day, hhmm(gridStart + i * 60))}/>)}
            {clipped.map(item => {
              const block = dayItems.find(b => b.id === item.id)!, l = layout.get(block.id)!;
              const s = timeMinutes(item.start.slice(11)), e = item.end.slice(0, 10) > day ? 1440 : timeMinutes(item.end.slice(11));
              const color = p.data.modules.find(m => m.id === block.moduleId)?.color || "#6955d8";
              return <div key={block.id} className={`tt-block ${block.kind === "Lernzeit" ? "is-study" : "is-event"} ${(e - s) <= 30 ? "is-short" : (e - s) <= 60 ? "is-compact" : ""} ${block.done ? "is-done" : ""} ${ghost?.block.id === block.id ? "is-dragging" : ""}`} style={{ top: (s - gridStart) * px, height: Math.max(24, (e - s) * px), left: `${l.col / l.cols * 100}%`, width: `${100 / l.cols}%`, "--tt-color": color } as CSSProperties}>
                <button className="tt-block-main" disabled={p.busy} aria-label={`${block.title}, ${block.kind}, ${block.start.slice(11)} bis ${block.end.slice(11)}${block.done ? ", erledigt" : ""}`} onPointerDown={ev => begin(ev, block, "move")} onPointerMove={move} onPointerUp={() => void finish()} onPointerCancel={() => { drag.current = null; setGhost(null); }} onClick={() => { if (!suppressClick.current) open(block); }}><span className="tt-block-kind">{block.kind === "Lernzeit" ? <BookOpen size={12} aria-hidden="true"/> : <GraduationCap size={12} aria-hidden="true"/>}<span>{block.kind}{block.done ? " · erledigt" : ""}</span></span><b className="tt-block-title">{block.title}</b><span className="tt-block-time">{block.start.slice(11)}–{block.end.slice(11)}</span>{block.location && <small>{block.location}</small>}</button>
                <button className="tt-resize" aria-label={`Dauer von ${block.title} ändern`} disabled={p.busy} onPointerDown={ev => begin(ev, block, "resize")} onPointerMove={move} onPointerUp={() => void finish()} onPointerCancel={() => { drag.current = null; setGhost(null); }} onClick={() => { if (!suppressClick.current) open(block); }}/>
              </div>;
            })}
            {ghost?.date === day && <div className="tt-ghost" style={{ top: (timeMinutes(ghost.time) - gridStart) * px, height: ghost.minutes * px }}>{ghost.block.title}<br/>{ghost.time}–{wallEnd(ghost.date, ghost.time, ghost.minutes).slice(11)}</div>}
          </div>
        </div>;
      })}
    </div>
    <p className="tt-hint">Eintrag anklicken, um Zeiten zu bearbeiten. Am Computer kannst du Blöcke ziehen und ihre Dauer am unteren Rand ändern. Bei Serien betrifft Ziehen nur diesen Termin.</p>
    {editing && <TimetableEditor key={editing.block?.id || "new"} {...p} editing={editing} close={() => setEditing(null)}/>}
  </section>;
}

function TimetableEditor(p: Props & { editing: Editing; close: () => void }) {
  const { block, event } = p.editing, study = block?.kind === "Lernzeit", task = study ? p.data.tasks.find(t => t.id === block.sourceId) : undefined;
  const [scope, setScope] = useState<"instance" | "all">("instance");
  const [value, setValue] = useState<TimetableEvent>(() => event ? { ...event, date: p.editing.date, time: p.editing.time, minutes: block ? (Date.parse(block.end + ":00Z") - Date.parse(block.start + ":00Z")) / 60000 : event.minutes, location: block?.location || event.location } : {
    id: crypto.randomUUID(), moduleId: block?.moduleId || p.data.modules[0]?.id || "", kind: "Vorlesung", date: p.editing.date, time: p.editing.time, minutes: task?.minutes || 90, location: "", intervalWeeks: 0, until: null, exceptions: [],
  });
  const [error, setError] = useState(""), [confirmDelete, setConfirmDelete] = useState(false), [clearExceptions, setClearExceptions] = useState(false);
  const retry = useRef<{ body: string; key: string } | null>(null);
  const changeScope = (next: "instance" | "all") => { setScope(next); setConfirmDelete(false); setValue(v => ({ ...v, date: next === "all" ? event!.date : p.editing.date, time: next === "all" ? event!.time : p.editing.time, minutes: next === "all" ? event!.minutes : (Date.parse(block!.end + ":00Z") - Date.parse(block!.start + ":00Z")) / 60000, location: next === "all" ? event!.location : block!.location })); };
  const commit = async (ops: Operation[], reason: string) => {
    setError("");
    const body = JSON.stringify({ ops, reason });
    if (retry.current?.body !== body) retry.current = { body, key: crypto.randomUUID() };
    try { await p.write(ops, "Stundenplan gespeichert.", p.editing.revision, retry.current.key, reason, study ? block?.moduleId : undefined); p.close(); }
    catch (e) { setError((e as Error).message); }
  };
  const save = async () => {
    if (study) return commit([{ entity: "tasks", action: "update", id: block!.sourceId, data: { date: value.date, time: value.time, minutes: value.minutes } }], "Lernzeit im Stundenplan geändert");
    if (event?.intervalWeeks && scope === "instance") return commit([{ entity: "timetableEvents", action: "update", id: event.id, data: { exceptions: [...event.exceptions.filter(ex => ex.originalDate !== block!.originalDate), { originalDate: block!.originalDate, date: value.date, time: value.time, minutes: value.minutes, location: value.location, cancelled: false }] } }], "Einzeltermin der Veranstaltung geändert");
    const next = { ...value, until: value.intervalWeeks ? value.until : null, exceptions: clearExceptions ? [] : value.exceptions };
    if (next.exceptions.some(ex => !next.intervalWeeks || !isSeriesDate(next, ex.originalDate))) { setError("Die Serienänderung passt nicht zu vorhandenen Ausnahmen. Bitte die Ausnahmen ausdrücklich zurücksetzen oder nur diesen Termin ändern."); return; }
    return commit([{ entity: "timetableEvents", action: event ? "update" : "create", id: next.id, data: next }], event ? "Veranstaltung geändert" : "Veranstaltung angelegt");
  };
  const remove = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    if (event?.intervalWeeks && scope === "instance") void commit([{ entity: "timetableEvents", action: "update", id: event.id, data: { exceptions: [...event.exceptions.filter(ex => ex.originalDate !== block!.originalDate), { originalDate: block!.originalDate, date: value.date, time: value.time, minutes: value.minutes, location: value.location, cancelled: true }] } }], "Einzeltermin fällt aus");
    else if (event) void commit([{ entity: "timetableEvents", action: "delete", id: event.id }], "Veranstaltung entfernt");
  };
  return <Modal title={study ? "Lernzeit" : event ? "Veranstaltung bearbeiten" : "Veranstaltung anlegen"} onClose={p.close} closeDisabled={p.busy}>
    <form onSubmit={e => { e.preventDefault(); void save(); }}>
      {event?.intervalWeeks ? <label className="tt-scope">Änderung gilt für<select value={scope} onChange={e => changeScope(e.target.value as "instance" | "all")} disabled={p.busy}><option value="instance">Nur diesen Termin</option><option value="all">Die gesamte Serie</option></select></label> : null}
      <div className="form-fields tt-fields">
        <label>Modul<select required value={value.moduleId} disabled={p.busy || !!study || !!(event?.intervalWeeks && scope === "instance")} onChange={e => setValue(v => ({ ...v, moduleId: e.target.value }))}>{p.data.modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
        {!study && <label>Art<select value={value.kind} disabled={p.busy || !!(event?.intervalWeeks && scope === "instance")} onChange={e => setValue(v => ({ ...v, kind: e.target.value as TimetableEvent["kind"] }))}><option>Vorlesung</option><option>Übung</option></select></label>}
        <label>Datum<input required type="date" value={value.date} disabled={p.busy} onChange={e => setValue(v => ({ ...v, date: e.target.value }))}/></label>
        <label>Beginn<input required type="time" value={value.time} disabled={p.busy} onChange={e => setValue(v => ({ ...v, time: e.target.value }))}/></label>
        <label>Dauer (Minuten)<input required type="number" min={1} max={720} value={value.minutes} disabled={p.busy} onChange={e => setValue(v => ({ ...v, minutes: Number(e.target.value) }))}/></label>
        {!study && <label>Raum / Ort (optional)<input maxLength={200} value={value.location} disabled={p.busy} onChange={e => setValue(v => ({ ...v, location: e.target.value }))}/></label>}
        {!study && (!event?.intervalWeeks || scope === "all") && <><label>Wiederholung<select value={value.intervalWeeks} disabled={p.busy} onChange={e => setValue(v => ({ ...v, intervalWeeks: Number(e.target.value) as 0 | 1 | 2 }))}><option value={0}>Einmalig</option><option value={1}>Wöchentlich</option><option value={2}>Alle zwei Wochen</option></select></label>{value.intervalWeeks > 0 && <label>Letzter Serientag<input required type="date" min={value.date} value={value.until || ""} disabled={p.busy} onChange={e => setValue(v => ({ ...v, until: e.target.value }))}/></label>}</>}
      </div>
      {scope === "all" && !!event?.exceptions.length && <div className="tt-exceptions"><p>{event.exceptions.length} Ausnahme(n) sind gespeichert.</p><label><input type="checkbox" checked={clearExceptions} disabled={p.busy} onChange={e => setClearExceptions(e.target.checked)}/>Alle Ausnahmen zurücksetzen (Ausfälle und Verschiebungen)</label></div>}
      {study && <p className="tt-hint">Du bearbeitest die Zeit des vorhandenen Lernblocks. Lerninhalte und Ergebnisse bleiben erhalten.</p>}
      {error && <p className="tt-warning" role="alert">{error}</p>}
      {confirmDelete && <p className="tt-warning">{event?.intervalWeeks && scope === "instance" ? "Dieser Termin fällt aus. Die Serie bleibt erhalten." : "Die Veranstaltung einschließlich ihrer Serienausnahmen wird entfernt."} Erneut bestätigen.</p>}
      <div className="tt-dialog-actions"><button type="button" className="tt-button" disabled={p.busy} onClick={p.close}>Abbrechen</button>{event && <button type="button" className="tt-button danger" disabled={p.busy} onClick={remove}>{confirmDelete ? "Entfernen bestätigen" : event.intervalWeeks && scope === "instance" ? "Termin fällt aus" : "Entfernen"}</button>}<button type="submit" className="tt-button primary" disabled={p.busy}>{p.busy ? "Speichert …" : "Speichern"}</button></div>
    </form>
    {study && task && <div className="tt-dialog-links"><button className="tt-button" disabled={p.busy} onClick={() => { p.close(); p.openTask(task); }}><Clock3 size={16}/>Zum Lernblock</button><button className="tt-button" disabled={p.busy} onClick={() => { p.close(); p.openModule(block!.moduleId); }}><BookOpen size={16}/>Zum Modul</button></div>}
  </Modal>;
}

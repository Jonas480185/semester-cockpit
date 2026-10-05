import { offsetDate, type Snapshot } from "./model";
import type { TimetableBlock, TimetableEvent } from "./timetable-model";

// Local wall-clock arithmetic: recurring 10:00 remains 10:00 across DST.
export const timeMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export function wallEnd(date: string, time: string, minutes: number) {
  const d = new Date(date + "T" + time + ":00Z");
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 16);
}
export function isSeriesDate(event: Pick<TimetableEvent, "date" | "intervalWeeks" | "until">, date: string) {
  if (!event.intervalWeeks) return date === event.date;
  const days = (Date.parse(date + "T12:00:00Z") - Date.parse(event.date + "T12:00:00Z")) / 86400000;
  return days >= 0 && days % (event.intervalWeeks * 7) === 0 && !!event.until && date <= event.until;
}
export function timetableBlocks(data: Snapshot, from: string, to: string): TimetableBlock[] {
  const out: TimetableBlock[] = [];
  const inWindow = (start: string, end: string) => start < to + "T00:00" && end > from + "T00:00";
  const add = (event: TimetableEvent, originalDate: string, date: string, time: string, minutes: number, location: string) => {
    const start = date + "T" + time, end = wallEnd(date, time, minutes);
    if (inWindow(start, end)) out.push({ id: event.id + "@" + originalDate, sourceId: event.id, originalDate, moduleId: event.moduleId, title: data.modules.find(m => m.id === event.moduleId)?.title || "Unbekanntes Modul", kind: event.kind, start, end, location, done: false });
  };
  for (const event of data.timetableEvents || []) {
    // Check moved occurrences independently of their original week.
    for (const ex of event.exceptions) if (!ex.cancelled && isSeriesDate(event, ex.originalDate)) add(event, ex.originalDate, ex.date, ex.time, ex.minutes, ex.location);
    const step = event.intervalWeeks * 7;
    const first = step ? Math.max(0, Math.floor((Date.parse(from + "T12:00:00Z") - Date.parse(event.date + "T12:00:00Z")) / 86400000 / step) - 1) : 0;
    for (let i = first; ; i++) {
      const date = step ? offsetDate(event.date, i * step) : event.date;
      if (date >= to || (step && (!event.until || date > event.until))) break;
      if (!event.exceptions.some(ex => ex.originalDate === date)) add(event, date, date, event.time, event.minutes, event.location);
      if (!step) break;
    }
  }
  for (const task of data.tasks) {
    const topic = data.topics.find(t => t.id === task.topicId), mod = data.modules.find(m => m.id === topic?.moduleId);
    const start = task.date + "T" + task.time, end = wallEnd(task.date, task.time, task.minutes);
    if (mod && inWindow(start, end)) out.push({ id: "task@" + task.id, sourceId: task.id, originalDate: task.date, moduleId: mod.id, title: mod.title, kind: "Lernzeit", start, end, location: "", done: task.status === "erledigt" });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}
export function overlaps(a: Pick<TimetableBlock, "start" | "end">, b: Pick<TimetableBlock, "start" | "end">) {
  return a.start < b.end && b.start < a.end;
}
// Column placement adapted from Uni-Kalender/shared/recurrence.ts.
export function layoutBlocks(items: TimetableBlock[]) {
  const result = new Map<string, { col: number; cols: number }>();
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end) || a.id.localeCompare(b.id));
  let group: TimetableBlock[] = [], end = "";
  const flush = () => {
    const ends: string[] = [], assigned: [TimetableBlock, number][] = [];
    for (const item of group) {
      let col = ends.findIndex(e => e <= item.start);
      if (col < 0) { col = ends.length; ends.push(item.end); } else ends[col] = item.end;
      assigned.push([item, col]);
    }
    for (const [item, col] of assigned) result.set(item.id, { col, cols: ends.length });
    group = []; end = "";
  };
  for (const item of sorted) {
    if (group.length && item.start >= end) flush();
    group.push(item); if (item.end > end) end = item.end;
  }
  flush(); return result;
}

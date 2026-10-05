import { z } from "zod";
import { ApiError, snapshot, type Auth } from "./server";
import { timetableEnabled } from "./timetable-config";
import { timetableBlocks, overlaps } from "./timetable";
import { convert } from "./openapi";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(s + "T12:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
});
export const timetableRange = z.object({
  from: date, to: date,
  moduleId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional(),
}).strict().refine(p => p.to > p.from && (Date.parse(p.to) - Date.parse(p.from)) / 86400000 <= 62, "Zeitraum: 1–62 Tage, Ende exklusiv.");
export const timetableTool = {
  name: "semester_timetable",
  description: "Read timetable occurrences and occupied intervals (Europe/Berlin, local wall time, end exclusive). Learning blocks show module names only and retain their task IDs. ALL occupied intervals are returned even with moduleId, so other modules are never treated as free time. Use semester_module_context for learning contents; existing semester_write_batch/semester_reschedule for writes within budgets and 14 days. Lecture series use timetableEvents, including exceptions; never invent official dates. Existing conflicts are reported, not moved.",
  inputSchema: convert(timetableRange),
  annotations: { readOnlyHint: true },
};
export async function readTimetable(auth: Auth, input: unknown) {
  if (!timetableEnabled()) throw new ApiError(404, "Der Stundenplan ist deaktiviert.");
  const p = timetableRange.parse(input), s = await snapshot(auth.owner);
  if (p.moduleId && !s.data.modules.some(m => m.id === p.moduleId)) throw new ApiError(404, "Modul nicht gefunden.");
  const all = timetableBlocks(s.data, p.from, p.to);
  return {
    revision: s.revision, from: p.from, to: p.to, timezone: "Europe/Berlin",
    blocks: all.filter(b => !p.moduleId || b.moduleId === p.moduleId),
    occupied: all.map(b => ({ id: b.id, moduleId: b.moduleId, kind: b.kind, start: b.start, end: b.end })),
    conflicts: all.flatMap((a, i) => all.slice(i + 1).filter(b => overlaps(a, b)).map(b => ({ first: a.id, second: b.id }))),
  };
}

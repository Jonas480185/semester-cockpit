import { z } from "zod";
import { isSeriesDate } from "./timetable";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(s + "T12:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, "Ungültiges Datum");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const minutes = z.number().int().min(1).max(720);
const location = z.string().trim().max(200);
export const timetableEventSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  moduleId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  kind: z.enum(["Vorlesung", "Übung"]),
  date, time, minutes,
  location: location.default(""),
  intervalWeeks: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0),
  until: date.nullable().default(null),
  exceptions: z.array(z.object({
    originalDate: date, date, time, minutes, location, cancelled: z.boolean(),
  }).strict()).max(200).default([]),
}).strict().superRefine((event, ctx) => {
  if (event.intervalWeeks ? !event.until || event.until < event.date || event.until > addYear(event.date) : event.until !== null || event.exceptions.length > 0)
    ctx.addIssue({ code: "custom", message: "Serien benötigen ein Ende innerhalb eines Jahres; Einzeltermine haben keine Serienausnahmen." });
  const dates = new Set<string>();
  for (const exception of event.exceptions) {
    if (!isSeriesDate(event, exception.originalDate) || dates.has(exception.originalDate))
      ctx.addIssue({ code: "custom", message: "Eine Ausnahme muss eindeutig auf einen Termin der Serie verweisen." });
    dates.add(exception.originalDate);
  }
});
function addYear(date: string) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 366);
  return d.toISOString().slice(0, 10);
}

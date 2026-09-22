import { z } from "zod";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const title = z.string().trim().min(1).max(300);
const notes = z.string().max(5000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
    "Ungültiges Datum",
  );
const stamp = z.string().datetime({ offset: true });
const rank = z.number().int().min(1).max(3);
const status = z.enum(["nicht begonnen", "unsicher", "in Arbeit", "sicher"]);
const open = z.enum(["offen", "erledigt"]);
export const schemas = {
  modules: z
    .object({
      id,
      title,
      code: z.string().min(1).max(6),
      color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
      credits: z.number().int().min(1).max(30),
      examDate: date.nullable().default(null),
      target: z.number().int().min(0).max(100),
      learningNotes: notes.default(""),
    })
    .strict(),
  topics: z
    .object({
      id,
      moduleId: id,
      title,
      status,
      priority: rank,
      relevance: rank,
      lastPracticed: date.nullable(),
      position: z.number().int().min(0).max(10000).default(0),
      plannedStart: date.nullable().default(null),
      plannedEnd: date.nullable().default(null),
    })
    .strict(),
  tasks: z
    .object({
      sourceMaterialId: id.nullable().default(null),
      sourcePageStart: z.number().int().min(1).max(100000).nullable().default(null),
      sourcePageEnd: z.number().int().min(1).max(100000).nullable().default(null),
      sourceExercise: z.string().trim().max(120).default(""),
      goal: z.string().trim().max(300).default(""),
      instructions: notes.default(""),
      id,
      topicId: id,
      title,
      date,
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      minutes: z.number().int().min(1).max(720),
      status: open,
      kind: z.enum(["Lernen", "Wiederholung", "Selbsttest"]),
      priority: rank,
    })
    .strict(),
  tests: z
    .object({
      id,
      topicId: id,
      date: stamp,
      score: z.number().int().min(0).max(100),
      independent: z.boolean(),
      notes,
    })
    .strict(),
  gaps: z
    .object({
      id,
      topicId: id,
      description: title,
      status: z.enum(["offen", "geschlossen"]),
      date,
    })
    .strict(),
  sessions: z
    .object({
      id,
      topicId: id,
      date,
      minutes: z.number().int().min(0).max(720),
      notes,
      taskId: id.nullable().default(null),
      assistance: z.enum(["unbekannt", "selbstständig", "mit Hilfe"]).default("unbekannt"),
      difficulty: z.string().trim().max(1000).default(""),
      nextStep: z.string().trim().max(1000).default(""),
      recordedAt: z.union([stamp, z.literal("")]).default(""),
    })
    .strict(),
  reviews: z
    .object({
      id,
      topicId: id,
      date,
      status: open,
      interval: z.number().int().min(1).max(365),
    })
    .strict(),
  deadlines: z
    .object({
      id,
      moduleId: id,
      title,
      date,
      kind: z.enum(["Klausur", "Abgabe"]),
    })
    .strict(),
  plans: z
    .object({
      id,
      moduleId: id.nullable().default(null),
      startDate: date,
      endDate: date,
      title,
      notes,
      targetMinutes: z.number().int().min(0).max(10080),
    })
    .strict(),
  history: z
    .object({ id, topicId: id, date: stamp, status, source: title })
    .strict(),
};
export const operationSchema = z
  .object({
    entity: z.enum([
      "modules",
      "topics",
      "tasks",
      "tests",
      "gaps",
      "sessions",
      "reviews",
      "deadlines",
      "plans",
    ]),
    action: z.enum(["create", "update", "delete"]),
    id: id.optional(),
    data: z.record(z.unknown()).optional(),
  })
  .strict();
export const batchSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    reason: z.string().trim().min(1).max(300).optional(),
    moduleScope: id.optional(),
    operations: z.array(operationSchema).min(1).max(80),
  })
  .strict();
export type Operation = z.infer<typeof operationSchema>;

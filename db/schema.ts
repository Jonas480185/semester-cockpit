import {
  pgSchema,
  text,
  integer,
  primaryKey,
  index,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
const semester = pgSchema("semester");
const identity = () => ({
  id: text("id").notNull(),
  ownerId: text("ownerId").notNull(),
  updatedAt: text("updatedAt").notNull(),
});
export const workspaces = semester.table(
  "workspaces",
  {
    ownerId: text("ownerId").primaryKey(),
    revision: integer("revision").notNull().default(0),
    createdAt: text("createdAt").notNull(),
  },
  (t) => [check("revision_nonnegative", sql`${t.revision} >= 0`)],
);
export const modules = semester.table(
  "modules",
  {
    ...identity(),
    title: text("title").notNull(),
    code: text("code").notNull(),
    color: text("color").notNull(),
    credits: integer("credits").notNull(),
    examDate: text("examDate"),
    target: integer("target").notNull(),
    learningNotes: text("learningNotes").notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.id] })],
);
export const topics = semester.table(
  "topics",
  {
    ...identity(),
    moduleId: text("moduleId").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull(),
    priority: integer("priority").notNull(),
    relevance: integer("relevance").notNull(),
    lastPracticed: text("lastPracticed"),
    position: integer("position").notNull().default(0),
    plannedStart: text("plannedStart"),
    plannedEnd: text("plannedEnd"),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.id] }),
    foreignKey({
      columns: [t.ownerId, t.moduleId],
      foreignColumns: [modules.ownerId, modules.id],
    }),
    index("idx_topics_module").on(t.ownerId, t.moduleId),
  ],
);
export const materials = semester.table(
  "materials",
  {
    ...identity(),
    moduleId: text("moduleId").notNull(),
    title: text("title").notNull(),
    documentType: text("documentType").notNull(),
    semester: text("semester").notNull().default(""),
    description: text("description").notNull().default(""),
    relatedMaterialId: text("relatedMaterialId"),
    fileName: text("fileName").notNull(),
    mimeType: text("mimeType").notNull().default("application/pdf"),
    size: integer("size").notNull(),
    objectPath: text("objectPath").notNull().unique(),
    sha256: text("sha256"),
    state: text("state").notNull().default("pending"),
    version: integer("version").notNull().default(1),
    createdAt: text("createdAt").notNull(),
  },
  (t) => [primaryKey({columns:[t.ownerId,t.id]}),foreignKey({columns:[t.ownerId,t.moduleId],foreignColumns:[modules.ownerId,modules.id]}),index("idx_materials_module_type").on(t.ownerId,t.moduleId,t.documentType,t.state),index("idx_materials_related").on(t.ownerId,t.relatedMaterialId)],
);
export const tasks = semester.table(
  "tasks",
  {
    ...identity(),
    goal: text("goal").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    topicId: text("topicId").notNull(),
    sourceMaterialId: text("sourceMaterialId"),
    sourcePageStart: integer("sourcePageStart"),
    sourcePageEnd: integer("sourcePageEnd"),
    sourceExercise: text("sourceExercise").notNull().default(""),
    title: text("title").notNull(),
    date: text("date").notNull(),
    time: text("time").notNull(),
    minutes: integer("minutes").notNull(),
    status: text("status").notNull(),
    kind: text("kind").notNull(),
    priority: integer("priority").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.id] }),
    foreignKey({
      columns: [t.ownerId, t.topicId],
      foreignColumns: [topics.ownerId, topics.id],
    }),
    index("idx_tasks_date").on(t.ownerId, t.date),
    index("idx_tasks_material").on(t.ownerId,t.sourceMaterialId),
    foreignKey({columns:[t.ownerId,t.sourceMaterialId],foreignColumns:[materials.ownerId,materials.id]}),
  ],
);
export const tests = semester.table(
  "tests",
  {
    ...identity(),
    topicId: text("topicId").notNull(),
    date: text("date").notNull(),
    score: integer("score").notNull(),
    independent: integer("independent").notNull(),
    notes: text("notes").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.id] }),
    foreignKey({
      columns: [t.ownerId, t.topicId],
      foreignColumns: [topics.ownerId, topics.id],
    }),
    index("idx_tests_topic").on(t.ownerId, t.topicId, t.date),
  ],
);
export const gaps = semester.table(
  "gaps",
  {
    ...identity(),
    topicId: text("topicId").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull(),
    date: text("date").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.id] }),
    foreignKey({
      columns: [t.ownerId, t.topicId],
      foreignColumns: [topics.ownerId, topics.id],
    }),
  ],
);
export const sessions = semester.table(
  "sessions",
  {
    ...identity(),
    taskId: text("taskId"),
    assistance: text("assistance").notNull().default("unbekannt"),
    difficulty: text("difficulty").notNull().default(""),
    nextStep: text("nextStep").notNull().default(""),
    recordedAt: text("recordedAt").notNull().default(""),
    topicId: text("topicId").notNull(),
    date: text("date").notNull(),
    minutes: integer("minutes").notNull(),
    notes: text("notes").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.id] }),
    foreignKey({
      columns: [t.ownerId, t.topicId],
      foreignColumns: [topics.ownerId, topics.id],
    }),
    foreignKey({ columns: [t.ownerId, t.taskId], foreignColumns: [tasks.ownerId, tasks.id] }),
    index("idx_sessions_task").on(t.ownerId, t.taskId),
    index("idx_sessions_date").on(t.ownerId, t.date),
  ],
);
export const reviews = semester.table(
  "reviews",
  {
    ...identity(),
    topicId: text("topicId").notNull(),
    date: text("date").notNull(),
    status: text("status").notNull(),
    interval: integer("interval").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.id] }),
    foreignKey({
      columns: [t.ownerId, t.topicId],
      foreignColumns: [topics.ownerId, topics.id],
    }),
    index("idx_reviews_date").on(t.ownerId, t.date),
  ],
);
export const deadlines = semester.table(
  "deadlines",
  {
    ...identity(),
    moduleId: text("moduleId").notNull(),
    title: text("title").notNull(),
    date: text("date").notNull(),
    kind: text("kind").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.id] }),
    foreignKey({
      columns: [t.ownerId, t.moduleId],
      foreignColumns: [modules.ownerId, modules.id],
    }),
  ],
);
export const plans = semester.table(
  "plans",
  {
    ...identity(),
    moduleId: text("moduleId"),
    startDate: text("startDate").notNull(),
    endDate: text("endDate").notNull(),
    title: text("title").notNull(),
    notes: text("notes").notNull(),
    targetMinutes: integer("targetMinutes").notNull(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.id] }), foreignKey({ columns: [t.ownerId, t.moduleId], foreignColumns: [modules.ownerId, modules.id] }), index("idx_plans_module").on(t.ownerId, t.moduleId)],
);
export const history = semester.table(
  "history",
  {
    ...identity(),
    topicId: text("topicId").notNull(),
    date: text("date").notNull(),
    status: text("status").notNull(),
    source: text("source").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.id] }),
    foreignKey({
      columns: [t.ownerId, t.topicId],
      foreignColumns: [topics.ownerId, topics.id],
    }),
    index("idx_history_date").on(t.ownerId, t.date),
  ],
);
export const audit = semester.table(
  "audit",
  {
    id: text("id").primaryKey(),
    ownerId: text("ownerId").notNull(),
    date: text("date").notNull(),
    actor: text("actor").notNull(),
    reason: text("reason").notNull().default(""),
    entity: text("entity").notNull(),
    entityId: text("entityId").notNull(),
    action: text("action").notNull(),
    before: text("before"),
    after: text("after"),
    revision: integer("revision").notNull(),
  },
  (t) => [index("idx_audit_owner_date").on(t.ownerId, t.date)],
);
export const tokens = semester.table(
  "tokens",
  {
    id: text("id").primaryKey(),
    ownerId: text("ownerId").notNull(),
    name: text("name").notNull(),
    hash: text("hash").notNull().unique(),
    scope: text("scope").notNull(),
    createdAt: text("createdAt").notNull(),
    expiresAt: text("expiresAt").notNull(),
    revoked: integer("revoked").notNull().default(0),
  },
  (t) => [index("idx_tokens_owner").on(t.ownerId)],
);
export const requests = semester.table(
  "requests",
  {
    ownerId: text("ownerId").notNull(),
    key: text("key").notNull(),
    hash: text("hash").notNull(),
    response: text("response").notNull(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.key] })],
);

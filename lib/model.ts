export const statuses = [
  "nicht begonnen",
  "unsicher",
  "in Arbeit",
  "sicher",
] as const;
export type TopicStatus = (typeof statuses)[number];
export type Module = {
  id: string;
  title: string;
  code: string;
  color: string;
  credits: number;
  examDate: string | null;
  target: number;
  learningNotes?: string;
};
export type Topic = {
  position?: number;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  id: string;
  moduleId: string;
  title: string;
  status: TopicStatus;
  priority: number;
  relevance: number;
  lastPracticed: string | null;
};
export type Task = {
  goal?: string;
  instructions?: string;
  sourceMaterialId?: string | null;
  sourcePageStart?: number | null;
  sourcePageEnd?: number | null;
  sourceExercise?: string;
  id: string;
  topicId: string;
  title: string;
  date: string;
  time: string;
  minutes: number;
  status: "offen" | "erledigt";
  kind: "Lernen" | "Wiederholung" | "Selbsttest";
  priority: number;
};
export type Test = {
  id: string;
  topicId: string;
  date: string;
  score: number;
  independent: boolean;
  notes: string;
};
export type Gap = {
  id: string;
  topicId: string;
  description: string;
  status: "offen" | "geschlossen";
  date: string;
};
export type Session = {
  taskId?: string | null;
  assistance?: "unbekannt" | "selbstständig" | "mit Hilfe";
  difficulty?: string;
  nextStep?: string;
  recordedAt?: string;
  id: string;
  topicId: string;
  date: string;
  minutes: number;
  notes: string;
};
export type Review = {
  id: string;
  topicId: string;
  date: string;
  status: "offen" | "erledigt";
  interval: number;
};
export type Deadline = {
  id: string;
  moduleId: string;
  title: string;
  date: string;
  kind: "Klausur" | "Abgabe";
};
export type Plan = {
  moduleId?: string | null;
  id: string;
  startDate: string;
  endDate: string;
  title: string;
  notes: string;
  targetMinutes: number;
};
export type History = {
  id: string;
  topicId: string;
  date: string;
  status: TopicStatus;
  source: string;
};
export type Snapshot = {
  modules: Module[];
  topics: Topic[];
  tasks: Task[];
  tests: Test[];
  gaps: Gap[];
  sessions: Session[];
  reviews: Review[];
  deadlines: Deadline[];
  plans: Plan[];
  history: History[];
};
export type Entity = keyof Snapshot;
export const entities: Entity[] = [
  "modules",
  "topics",
  "tasks",
  "tests",
  "gaps",
  "sessions",
  "reviews",
  "deadlines",
  "plans",
  "history",
];
export function today() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    new Date(),
  );
}
export function offsetDate(date: string, n: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function monday(date: string) {
  const d = new Date(date + "T12:00:00Z");
  return offsetDate(date, -((d.getUTCDay() + 6) % 7));
}
export function mastered(data: Snapshot, topic: Topic) {
  const latest = data.tests
    .filter((t) => t.topicId === topic.id)
    .sort(
      (a, b) =>
        Date.parse(b.date) - Date.parse(a.date) || b.id.localeCompare(a.id),
    )[0];
  return (
    topic.status === "sicher" &&
    !!latest &&
    latest.independent &&
    latest.score >= 80
  );
}
export function progress(data: Snapshot, id?: string) {
  const ts = data.topics.filter((t) => !id || t.moduleId === id);
  return ts.length
    ? Math.round((ts.filter((t) => mastered(data, t)).length / ts.length) * 100)
    : 0;
}
export function riskReasons(data: Snapshot, topic: Topic, date = today()) {
  const reasons: string[] = [];
  if (data.tasks.some(t => t.topicId === topic.id && t.status === "offen" && t.date < date)) reasons.push("Lernblock überfällig");
  if (data.reviews.some(r => r.topicId === topic.id && r.status === "offen" && r.date < date)) reasons.push("Wiederholung überfällig");
  if (!mastered(data, topic)) {
    if (topic.plannedEnd && topic.plannedEnd < date) reasons.push("Themenzeitraum abgelaufen; Nachweis offen");
    const exam = data.modules.find(m => m.id === topic.moduleId)?.examDate;
    if (exam && exam >= date && exam <= offsetDate(date, 14)) reasons.push("Klausur in höchstens 14 Tagen; Nachweis offen");
  }
  return reasons;
}
export function risks(data: Snapshot, date = today()) {
  return data.topics.filter(t => riskReasons(data, t, date).length > 0)
    .sort((a, b) => b.priority + b.relevance - a.priority - a.relevance);
}

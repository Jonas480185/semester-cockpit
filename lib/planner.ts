import { type Snapshot, monday, offsetDate, today, mastered } from "./model";
import {
  planningHorizon,
  weekSummary,
  taskOrder,
  topicSources,
} from "./study-planning";
import type { Operation } from "./validation";
export function proposeWeek(
  data: Snapshot,
  start = monday(offsetDate(today(), 7)),
) {
  const end = offsetDate(start, 6),
    summary = weekSummary(data, start);
  const existingPlan = data.plans.find(
    (p) => !p.moduleId && p.startDate === start && p.endDate === end,
  );
  const plan = existingPlan || {
    id: "",
    title: "Wochenbudget noch offen",
    startDate: start,
    endDate: end,
    targetMinutes: 0,
    notes: "",
  };
  const tasks: Snapshot["tasks"] = [],
    draft = structuredClone(data);
  const finish = (message: string) => ({
    plan: { ...plan, notes: message },
    tasks,
    operations: tasks.map((t) => ({
      entity: "tasks",
      action: "create",
      data: t,
    })) as Operation[],
  });
  if (summary.budget === null)
    return finish(
      "Bitte zuerst ein eindeutiges Gesamtbudget für diese Woche festlegen. Der Vorschlag erhöht keine Budgets.",
    );
  if (summary.overBy)
    return finish(
      "Die vorhandenen Blöcke überschreiten bereits das Wochenbudget. Bitte zuerst umplanen.",
    );
  const ranked = [...data.topics]
    .filter((t) => !t.plannedStart || t.plannedStart <= end)
    .sort((a, b) => score(b) - score(a));
  function score(t: Snapshot["topics"][number]) {
    return (
      t.priority * 3 +
      t.relevance * 2 +
      (mastered(data, t) ? -12 : 6) +
      data.gaps.filter((g) => g.topicId === t.id && g.status === "offen")
        .length *
        5
    );
  }
  const minutes = (time: string) =>
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  for (let day = 0; day < 5; day++) {
    const date = offsetDate(start, day);
    if (date < today() || date > planningHorizon()) continue;
    for (const time of ["09:00", "10:15", "14:00"]) {
      const available = weekSummary(draft, start).available || 0;
      const topic = ranked.find(
        (t) =>
          (!t.plannedStart || t.plannedStart <= date) &&
          (!t.plannedEnd || t.plannedEnd >= date) &&
          !draft.tasks.some((x) => x.topicId === t.id && x.date === date) &&
          (weekSummary(draft, start, t.moduleId).available || 0) >= 15,
      );
      if (!topic || available < 15) continue;
      const duration = Math.min(
        45,
        available,
        weekSummary(draft, start, topic.moduleId).available || 0,
      );
      if (
        draft.tasks.some(
          (t) =>
            t.date === date &&
            minutes(t.time) < minutes(time) + duration &&
            minutes(t.time) + t.minutes > minutes(time),
        )
      )
        continue;
      const sources = topicSources(data, topic.id),
        source = sources.length === 1 ? sources[0] : undefined;
      const task: Snapshot["tasks"][number] = {
        id: crypto.randomUUID(),
        topicId: topic.id,
        title: topic.title.slice(0, 300),
        goal: "Eine passende Aufgabe zu diesem Thema bearbeiten und anschließend ohne Hilfe erklären.",
        date,
        time,
        minutes: duration,
        status: "offen",
        kind: "Lernen",
        priority: topic.priority,
        ...(source
          ? {
              sourceMaterialId: source.sourceMaterialId,
              sourcePageStart: source.sourcePageStart,
              sourcePageEnd: source.sourcePageEnd,
              sourceExercise: source.sourceExercise,
            }
          : {}),
      };
      tasks.push(task);
      draft.tasks.push(task);
      ranked.push(ranked.splice(ranked.indexOf(topic), 1)[0]);
    }
  }
  tasks.sort(taskOrder);
  return finish(
    tasks.length
      ? "Vorschlag innerhalb bestehender Gesamt- und Fachbudgets. Zeiten und Lernziele vor Übernahme prüfen. Keine Aussage zur vollständigen Stoffabdeckung."
      : "Keine passenden freien Blöcke innerhalb der Budgets. Fachbudgets, Themenzeiträume und bestehende Aufgaben prüfen.",
  );
}

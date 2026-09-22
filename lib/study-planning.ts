import {
  type Snapshot,
  type Module,
  type Topic,
  type Task,
  type Session,
  mastered,
  monday,
  offsetDate,
  today,
} from "./model";

export const planningHorizon = (date = today()) => offsetDate(date, 13);
export const taskOrder = (a: Task, b: Task) =>
  (a.date + a.time).localeCompare(b.date + b.time) || a.id.localeCompare(b.id);
export const topicOrder = (a: Topic, b: Topic) =>
  (a.position || Number.MAX_SAFE_INTEGER) -
    (b.position || Number.MAX_SAFE_INTEGER) ||
  (a.plannedStart || "9999").localeCompare(b.plannedStart || "9999") ||
  a.title.localeCompare(b.title, "de", { numeric: true });
export const feedbackOrder = (a: Session, b: Session) =>
  b.date.localeCompare(a.date) ||
  (b.recordedAt || "").localeCompare(a.recordedAt || "") ||
  b.id.localeCompare(a.id);
export function topicStage(data: Snapshot, topic: Topic) {
  if (mastered(data, topic)) return "selbstständig bestätigt";
  if (
    data.sessions.some((s) => s.topicId === topic.id) ||
    data.tasks.some((t) => t.topicId === topic.id && t.status === "erledigt") ||
    data.tests.some((t) => t.topicId === topic.id)
  )
    return "bearbeitet";
  if (topic.status !== "nicht begonnen") return "in Bearbeitung";
  return "noch nicht begonnen";
}
export function topicSources(data: Snapshot, topicId: string) {
  const seen = new Set<string>();
  return data.tasks
    .filter((t) => t.topicId === topicId && t.sourceMaterialId)
    .filter((t) => {
      const key = JSON.stringify([
        t.sourceMaterialId,
        t.sourcePageStart,
        t.sourcePageEnd,
        t.sourceExercise,
      ]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
export function weekSummary(
  data: Snapshot,
  start = monday(today()),
  moduleId?: string,
) {
  const end = offsetDate(start, 6),
    ids = new Set(
      data.topics
        .filter((t) => !moduleId || t.moduleId === moduleId)
        .map((t) => t.id),
    );
  const tasks = data.tasks.filter(
    (t) => ids.has(t.topicId) && t.date >= start && t.date <= end,
  );
  const sessions = data.sessions.filter(
    (s) => ids.has(s.topicId) && s.date >= start && s.date <= end,
  );
  const budgets = data.plans.filter(
    (p) =>
      (p.moduleId || null) === (moduleId || null) &&
      p.startDate === start &&
      p.endDate === end,
  );
  const budget = budgets.length === 1 ? budgets[0].targetMinutes : null;
  const planned = tasks.reduce((s, t) => s + t.minutes, 0),
    documented = sessions.reduce((s, t) => s + t.minutes, 0);
  const remaining = tasks
    .filter((t) => t.status === "offen")
    .reduce((s, t) => s + t.minutes, 0);
  // Completed blocks retain their reservation; reported overruns also consume capacity.
  const committed = Math.max(planned, documented + remaining);
  return {
    start,
    end,
    moduleId: moduleId || null,
    budget,
    planned,
    documented,
    remaining,
    committed,
    available: budget === null ? null : Math.max(0, budget - committed),
    overBy: budget === null ? 0 : Math.max(0, committed - budget),
    ambiguous: budgets.length > 1,
  };
}
export function planningWarnings(data: Snapshot, start = monday(today())) {
  const summaries = [
    weekSummary(data, start),
    ...data.modules.map((m) => weekSummary(data, start, m.id)),
  ];
  const warnings = summaries.flatMap((s) => {
    const name = s.moduleId
      ? data.modules.find((m) => m.id === s.moduleId)!.title
      : "Gesamtwoche";
    return s.ambiguous
      ? [
          `${name}: Mehrere Wochenbudgets überschneiden sich. Bitte zentral klären.`,
        ]
      : s.overBy
        ? [
            `${name}: ${s.overBy} Min. über dem Wochenbudget. Blöcke kürzen oder verschieben; das Budget bleibt unverändert.`,
          ]
        : [];
  });
  const allocated = summaries
    .slice(1)
    .reduce((sum, s) => sum + (s.budget || 0), 0);
  if (summaries[0].budget !== null && allocated > summaries[0].budget)
    warnings.push(
      `Die Fachbudgets überschreiten das Gesamtbudget um ${allocated - summaries[0].budget} Min. Bitte zentral neu verteilen.`,
    );
  const tasks = data.tasks
    .filter(
      (t) =>
        t.status === "offen" &&
        t.date >= start &&
        t.date <= offsetDate(start, 6),
    )
    .sort(taskOrder);
  const time = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  if (
    tasks.some((a, i) =>
      tasks
        .slice(i + 1)
        .some(
          (b) =>
            a.date === b.date &&
            time(a.time) < time(b.time) + b.minutes &&
            time(b.time) < time(a.time) + a.minutes,
        ),
    )
  )
    warnings.push(
      "Lernblöcke überschneiden sich zeitlich. Bitte Uhrzeiten prüfen.",
    );
  return warnings;
}
// Known module identities reuse the existing catalogue; these are planning policies,
// not claims that PDFs were reviewed or that a syllabus is complete.
export function curriculumPolicy(mod?: Module) {
  const identity = mod?.id || "";
  const ongoing = [
    "software-engineering", "demo-se",
    "geschaeftsprozessmanagement",
  ].includes(identity);
  const existing = ["mathematik", "finance", "rechnungswesen", "demo-math", "demo-accounting"].includes(
    identity,
  );
  return {
    basis: ongoing
      ? "laufend ergänzt"
      : existing
        ? "vorhandener Stoff"
        : "erfasste Themen",
    unknownContentExpected: ongoing,
    coverageVerified: false,
    description: ongoing
      ? "Die Übersicht wächst mit den Veranstaltungen. Weitere Inhalte sind noch unbekannt und werden ergänzt, sobald Unterlagen vorliegen."
      : existing
        ? "Der vorhandene Stoff und die hinterlegten Materialien bilden die Planungsgrundlage. Die vollständige Klausurabdeckung ist nicht geprüft."
        : "Die erfassten Themen bilden den bisherigen Stand ab. Vollständige Stoffabdeckung ist nicht geprüft.",
  };
}
export function latestTopicFeedback(data: Snapshot, topicId: string) {
  return (
    data.sessions.filter((s) => s.topicId === topicId).sort(feedbackOrder)[0] ||
    null
  );
}
export function latestBlockFeedback(data: Snapshot, taskId: string) {
  return (
    data.sessions.filter((s) => s.taskId === taskId).sort(feedbackOrder)[0] ||
    null
  );
}
export function nextLearningBlocks(data: Snapshot, date = today()) {
  const open = data.tasks
    .filter((t) => t.status === "offen" && t.date >= date)
    .sort(taskOrder);
  const todays = open.filter((t) => t.date === date);
  return todays.length ? todays : open.slice(0, 3);
}
export function moduleRoadmap(
  data: Snapshot,
  moduleId: string,
  date = today(),
) {
  const mod = data.modules.find((m) => m.id === moduleId);
  const topics = data.topics
    .filter((t) => t.moduleId === moduleId)
    .sort(topicOrder);
  const confirmed = topics.filter((t) => mastered(data, t));
  const openBlocks = data.tasks.filter((t) => t.status === "offen");
  const current = topics.filter(
    (t) =>
      !mastered(data, t) &&
      (openBlocks.some(
        (b) => b.topicId === t.id && b.date <= planningHorizon(date),
      ) ||
        t.status === "in Arbeit" ||
        !!data.sessions.find(
          (s) =>
            s.topicId === t.id &&
            s.nextStep &&
            s.date >= offsetDate(date, -13) &&
            s.date <= date,
        ) ||
        (!!t.plannedStart &&
          t.plannedStart <= date &&
          (!t.plannedEnd || t.plannedEnd >= date))),
  );
  const currentIds = new Set(current.map((t) => t.id));
  const outlook = topics.filter(
    (t) => !mastered(data, t) && !currentIds.has(t.id),
  );
  return {
    examDate: mod?.examDate || null,
    curriculum: curriculumPolicy(mod),
    confirmed,
    current,
    outlook,
    workedWithoutEvidence: topics.filter(
      (t) => topicStage(data, t) === "bearbeitet",
    ),
    unplannedTopicIds: topics
      .filter(
        (t) =>
          !mastered(data, t) &&
          !t.plannedStart &&
          !openBlocks.some((b) => b.topicId === t.id),
      )
      .map((t) => t.id),
    afterExamTopicIds: mod?.examDate
      ? topics
          .filter(
            (t) =>
              (!!t.plannedStart && t.plannedStart > mod.examDate!) ||
              (!!t.plannedEnd && t.plannedEnd > mod.examDate!) ||
              openBlocks.some(
                (b) => b.topicId === t.id && b.date > mod.examDate!,
              ),
          )
          .map((t) => t.id)
      : [],
  };
}
export const feedbackContract = {
  requiredAfterLearning: true,
  tool: "semester_module_feedback",
  fields: [
    "topicId",
    "taskId (bei geplantem Block)",
    "minutes (nur wenn bekannt)",
    "assistance",
    "difficulty",
    "nextStep",
  ],
  instructions:
    "Jede Lerneinheit mit einer gespeicherten Kurzrückmeldung abschließen. Bei einem vollständig bearbeiteten Block taskId und completed:true setzen; bei einer Teilbearbeitung bleibt der Block offen. Zeit nicht schätzen; fehlende Angaben beim Nutzer erfragen oder als unbekannt kennzeichnen. Schwierigkeit und nächsten Schritt knapp beschreiben. Nach dem Schreiben den Modulkontext erneut lesen und den Eintrag anhand der feedbackId prüfen. Bei Schreibfehlern den Lernabschluss nicht als gespeichert ausgeben.",
};
export function moduleStudyContext(data: Snapshot, moduleId: string) {
  const topics = data.topics
      .filter((t) => t.moduleId === moduleId)
      .sort(topicOrder),
    ids = new Set(topics.map((t) => t.id));
  const tasks = data.tasks.filter((t) => ids.has(t.topicId)).sort(taskOrder);
  const feedback = data.sessions
    .filter((s) => ids.has(s.topicId))
    .sort(feedbackOrder);
  const next =
    tasks.find((t) => t.status === "offen" && t.date >= today()) ||
    tasks.find((t) => t.status === "offen");
  return {
    asOf: today(),
    concreteUntil: planningHorizon(),
    roadmap: moduleRoadmap(data, moduleId),
    feedbackContract,
    pendingFeedback: tasks
      .filter(
        (t) => t.status === "erledigt" && !latestBlockFeedback(data, t.id),
      )
      .map((t) => ({
        taskId: t.id,
        topicId: t.topicId,
        date: t.date,
        label: "Blockbezogene Rückmeldung noch offen; kein Rückstandsnachweis",
      })),
    coverage:
      "Vollständigkeit des Stoffs wurde nicht anhand der Originalquellen geprüft.",
    topicOverview: topics.map((t) => ({
      ...t,
      learningStage: topicStage(data, t),
      sources: topicSources(data, t.id),
      plannedBlocks: tasks
        .filter((task) => task.topicId === t.id && task.status === "offen")
        .map(({ id, date, time, minutes }) => ({ id, date, time, minutes })),
      latestFeedback: feedback.find((s) => s.topicId === t.id) || null,
    })),
    currentPlan: tasks.filter(
      (t) => t.status === "offen" && t.date <= planningHorizon(),
    ),
    laterExistingBlocks: tasks.filter(
      (t) => t.status === "offen" && t.date > planningHorizon(),
    ),
    weeklyBudgets: [monday(today()), offsetDate(monday(today()), 7)].map(
      (start) => ({
        ...weekSummary(data, start, moduleId),
        warnings: planningWarnings(data, start),
      }),
    ),
    latestFeedback: feedback[0] || null,
    continuation: feedback[0]?.nextStep
      ? {
          topicId: feedback[0].topicId,
          taskId: feedback[0].taskId || null,
          feedbackId: feedback[0].id,
          text: feedback[0].nextStep,
          source: "feedback",
        }
      : next
        ? {
            topicId: next.topicId,
            taskId: next.id,
            feedbackId: null,
            text: next.goal || next.title,
            source: "plan",
          }
        : null,
    nextStep:
      feedback[0]?.nextStep ||
      next?.goal ||
      next?.title ||
      "Nächsten Lernschritt mit der zentralen Semesterplanung festlegen.",
    nextBlock: next || null,
  };
}
export function fachchatPrompt(data: Snapshot, task: Task) {
  const topic = data.topics.find((t) => t.id === task.topicId),
    mod = data.modules.find((m) => m.id === topic?.moduleId);
  return `Begleite mich im Fach ${mod?.title || ""}. Lies zuerst semester_module_context mit moduleId="${mod?.id}". Block taskId="${task.id}", Thema topicId="${task.topicId}"; Zeitbudget ${task.minutes} Minuten. Ziel: ${task.goal || task.title}. Beachte die Lernregeln und letzte Rückmeldung. Rufe benötigte Original-PDFs über semester_material_download ab; wähle Aufgaben aus, erkläre und korrigiere im Fachchat. Speichere zum Abschluss verbindlich semester_module_feedback mit diesen IDs, tatsächlicher Zeit falls bekannt (nicht schätzen), Hilfebedarf, offener Schwierigkeit und nächstem Schritt. Setze completed:true nur bei abgeschlossenem Block. Beachte feedbackContract, aktuelle Revision und Idempotenz. Lies danach den Kontext erneut, prüfe die feedbackId und nenne den nächsten Schritt. Erledigt bedeutet nicht beherrscht. Umplanung bleibt im Fachbudget; Budgetänderungen gehören in die zentrale Planung.`;
}

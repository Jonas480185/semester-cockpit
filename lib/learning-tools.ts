import { z } from "zod";
import { ApiError, type Auth, mutate } from "./server";
import { schemas } from "./validation";
import { convert } from "./openapi";

const id = schemas.topics.shape.id;
const shared = {
  moduleId: id,
  revision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(100),
};
export const feedbackInput = z
  .object({
    ...shared,
    feedbackId: id,
    topicId: id,
    taskId: id.optional(),
    date: schemas.sessions.shape.date,
    minutes: z.number().int().min(1).max(720).optional(),
    assistance: z.enum(["selbstständig", "mit Hilfe"]),
    difficulty: z.string().trim().max(1000).default(""),
    nextStep: z.string().trim().max(1000).default(""),
    notes: z.string().max(5000).default(""),
    completed: z.boolean().default(false),
  })
  .strict();
export const rescheduleInput = z
  .object({
    ...shared,
    reason: z.string().trim().min(1).max(300),
    moves: z
      .array(
        z
          .object({
            taskId: id,
            date: schemas.tasks.shape.date,
            time: schemas.tasks.shape.time,
            minutes: z.number().int().min(1).max(720).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict();
export const learningTools = [
  {
    name: "semester_module_feedback",
    description:
      "Required closing step after every Fachchat learning session: save a short report in existing sessions with topicId and taskId when working on a block, optional actual minutes, assistance, difficulty and nextStep. Use one stable feedbackId per report, current revision and the same idempotencyKey on retries. Read semester_module_context afterwards and verify the saved feedbackId. completed only closes this task; NEVER proves mastery or raises a budget. Omitted minutes mean unknown (stored as 0, not estimated). No test result is invented. Existing clients may omit optional fields; missing nextStep is reported in the receipt.",
    inputSchema: convert(feedbackInput),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "semester_reschedule",
    description:
      "Move one or multiple existing learning blocks within one module and its centrally allocated weekly budget. Requires reason, current revision and stable idempotencyKey. Changes only date/time and optional duration; preserves IDs, topics, source references, status and results. Target dates within next 14 days; missing/exceeded budgets return a conflict. Never recreates blocks or changes budgets. Use semester_write_batch for explicit central semester planning.",
    inputSchema: convert(rescheduleInput),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
];
export async function callLearningTool(
  auth: Auth,
  name: string,
  input: unknown,
) {
  if (auth.scope !== "read-write")
    throw new ApiError(403, "Keine Schreibberechtigung.");
  if (name === "semester_module_feedback") {
    const p = feedbackInput.parse(input);
    const result = await mutate(
      auth,
      {
        revision: p.revision,
        moduleScope: p.moduleId,
        reason: "Rückmeldung aus dem Fachchat",
        operations: [
          {
            entity: "sessions",
            action: "create",
            data: {
              id: p.feedbackId,
              topicId: p.topicId,
              taskId: p.taskId || null,
              date: p.date,
              minutes: p.minutes ?? 0,
              assistance: p.assistance,
              difficulty: p.difficulty,
              nextStep: p.nextStep,
              notes: p.notes,
            },
          },
          ...(p.completed && p.taskId
            ? [
                {
                  entity: "tasks",
                  action: "update",
                  id: p.taskId,
                  data: { status: "erledigt" },
                },
              ]
            : []),
        ],
      },
      p.idempotencyKey,
    );
    return {
      ...result,
      feedbackReceipt: {
        saved: true,
        feedbackId: p.feedbackId,
        topicId: p.topicId,
        taskId: p.taskId || null,
        minutesKnown: p.minutes !== undefined,
        nextStepProvided: !!p.nextStep,
      },
      verifyWith: {
        tool: "semester_module_context",
        arguments: { moduleId: p.moduleId },
      },
    };
  }
  const p = rescheduleInput.parse(input);
  if (new Set(p.moves.map((m) => m.taskId)).size !== p.moves.length)
    throw new ApiError(
      422,
      "Jeder Lernblock darf nur einmal in der Verschiebung vorkommen.",
    );
  return mutate(
    auth,
    {
      revision: p.revision,
      moduleScope: p.moduleId,
      reason: p.reason,
      operations: p.moves.map(({ taskId, ...data }) => ({
        entity: "tasks",
        action: "update",
        id: taskId,
        data,
      })),
    },
    p.idempotencyKey,
  );
}

/** Offline route/MCP regression using a disposable in-memory PostgreSQL database. */
import "./local-only";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { today, monday, offsetDate, risks } from "../lib/model";
import {
  weekSummary,
  topicStage,
  fachchatPrompt,
  planningWarnings,
  nextLearningBlocks,
  moduleRoadmap,
  curriculumPolicy,
} from "../lib/study-planning";
import { proposeWeek } from "../lib/planner";
mock.module("next/headers", {
  namedExports: { cookies: async () => ({ getAll: () => [], set: () => {} }) },
});
let engine: PGlite, server: PGLiteSocketServer;
{
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  engine = await PGlite.create();
  await engine.exec(
    "CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE SQL STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
  );
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await engine.exec(await readFile("supabase/migrations/" + file, "utf8"));
  server = new PGLiteSocketServer({
    db: engine,
    host: "127.0.0.1",
    port: 54325,
    maxConnections: 1,
  });
  await server.start();
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@127.0.0.1:54325/postgres";
}
const { initialize, db, hash, snapshot } = await import("../lib/server");
const { databasePool } = await import("../lib/postgres");
databasePool().options.max = 1;
const mcp = await import("../app/api/mcp/route");
const owner = "study-qa-" + crypto.randomUUID(),
  other = "study-qa-" + crypto.randomUUID();
const secret = "sem_" + crypto.randomUUID(),
  read = "sem_" + crypto.randomUUID(),
  foreign = "sem_" + crypto.randomUUID();
let count = 0;
function check(ok: unknown, label: string) {
  assert.ok(ok, label);
  count++;
  console.log("PASS", label);
}
async function rpc(
  method: string,
  params: unknown = {},
  key: string | null = secret,
) {
  const request = new Request("http://cockpit.test" + "/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { authorization: "Bearer " + key } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: "qa", method, params }),
  });
  return mcp.POST(request);
}
async function tool(name: string, args: unknown = {}, expected?: number) {
  const r = await rpc("tools/call", { name, arguments: args }),
    b = await r.json(),
    value = JSON.parse(b.result.content[0].text);
  if (expected) {
    assert.equal(value.status, expected);
    count++;
    return value;
  }
  assert.equal(b.result.isError, false, JSON.stringify(value));
  return value;
}
const revision = async () => (await snapshot(owner)).revision;
async function batch(operations: unknown[], extra: object = {}) {
  return tool("semester_write_batch", {
    revision: await revision(),
    idempotencyKey: crypto.randomUUID(),
    operations,
    ...extra,
  });
}
const start = monday(today()),
  next = offsetDate(start, 7),
  todayDate = today();
try {
  await initialize(owner);
  await initialize(other);
  for (const [o, key, scope] of [
    [owner, secret, "read-write"],
    [owner, read, "read"],
    [other, foreign, "read-write"],
  ])
    await db().batch([
      db()
        .prepare(
          'INSERT INTO tokens (id,"ownerId",name,hash,scope,"createdAt","expiresAt",revoked) VALUES (?,?,?,?,?,?,?,0)',
        )
        .bind(
          crypto.randomUUID(),
          o,
          "Study QA",
          await hash(key),
          scope,
          new Date().toISOString(),
          new Date(Date.now() + 900000).toISOString(),
        ),
    ]);
  await batch([
    ...["m1", "m2"].map((id) => ({
      entity: "modules",
      action: "create",
      data: {
        id,
        title: "QA " + id,
        code: id,
        color: "#6955d8",
        credits: 5,
        target: 60,
        examDate: offsetDate(today(), 90),
        learningNotes:
          "Definition vor Anwendung; keine Lösung vor dem eigenen Versuch.",
      },
    })),
    ...["m1", "m2"].map((id) => ({
      entity: "topics",
      action: "create",
      data: {
        id: "t" + id,
        moduleId: id,
        title: "QA Thema " + id,
        status: "nicht begonnen",
        priority: 3,
        relevance: 3,
        lastPracticed: null,
        plannedStart: offsetDate(today(), 30),
        plannedEnd: offsetDate(today(), 40),
      },
    })),
    ...[start, next].flatMap((week) =>
      [null, "m1", "m2"].map((moduleId) => ({
        entity: "plans",
        action: "create",
        data: {
          id: week + (moduleId || "all"),
          moduleId,
          title: "QA Budget",
          startDate: week,
          endDate: offsetDate(week, 6),
          targetMinutes: moduleId ? 120 : 240,
          notes: "Fest zugeteilt",
        },
      })),
    ),
  ]);
  check(
    risks((await snapshot(owner)).data).length === 0,
    "Future topics without feedback are not marked at risk",
  );
  await db().batch([
    db()
      .prepare(
        'INSERT INTO materials ("ownerId",id,"moduleId",title,"documentType","fileName",size,"objectPath",sha256,state,"createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        owner,
        "pdf",
        "m1",
        "QA Quelle",
        "Übung",
        "qa.pdf",
        50,
        owner + "/qa.pdf",
        "a".repeat(64),
        "ready",
        new Date().toISOString(),
        new Date().toISOString(),
      ),
  ]);
  await batch(
    ["a", "b"].map((id, i) => ({
      entity: "tasks",
      action: "create",
      data: {
        id,
        topicId: "tm1",
        title: "QA Übung " + id,
        goal: "Schlüssel selbstständig bestimmen",
        date: todayDate,
        time: i ? "11:00" : "09:00",
        minutes: 45,
        status: "offen",
        kind: "Lernen",
        priority: 2,
        sourceMaterialId: "pdf",
        sourcePageStart: 2,
        sourcePageEnd: 3,
        sourceExercise: "1b",
      },
    })),
  );
  let snap = (await snapshot(owner)).data;
  check(
    nextLearningBlocks(snap)
      .map((t) => t.id)
      .join(",") === "a,b",
    "Heute chooses today's open blocks in time order",
  );
  const originalTopics = JSON.stringify(snap.topics),
    originalPlans = JSON.stringify(snap.plans),
    originalDeadlines = JSON.stringify(snap.deadlines);
  const tools = await (await rpc("tools/list")).json();
  check(
    tools.result.tools.some(
      (t: { name: string; inputSchema: { properties: { moves: { items: { required: string[] } } } } }) =>
        t.name === "semester_reschedule" &&
        t.inputSchema.properties.moves.items.required.includes("taskId"),
    ),
    "New tool schema exposes typed move items and required IDs",
  );
  check(
    tools.result.tools.some((t: { name: string }) => t.name === "semester_write_batch"),
    "Legacy MCP write tool remains available",
  );
  const feedback = {
    moduleId: "m1",
    feedbackId: "report-1",
    topicId: "tm1",
    taskId: "a",
    date: todayDate,
    minutes: 25,
    assistance: "mit Hilfe",
    difficulty: "Fremdschlüssel noch unsicher",
    nextStep: "Zwei Beispiele ohne Musterlösung versuchen",
    completed: false,
    revision: await revision(),
    idempotencyKey: crypto.randomUUID(),
  };
  const receipt = await tool("semester_module_feedback", feedback);
  check(
    receipt.feedbackReceipt.saved &&
      receipt.feedbackReceipt.feedbackId === feedback.feedbackId &&
      receipt.feedbackReceipt.nextStepProvided &&
      receipt.verifyWith.arguments.moduleId === "m1",
    "Feedback returns saved IDs and a concrete verification read",
  );
  check(
    (await tool("semester_module_feedback", feedback)).replayed,
    "Feedback retry does not duplicate a report or time",
  );
  await tool(
    "semester_module_feedback",
    {
      ...feedback,
      revision: await revision(),
      idempotencyKey: crypto.randomUUID(),
    },
    409,
  );
  const single = {
    moduleId: "m1",
    revision: await revision(),
    idempotencyKey: crypto.randomUUID(),
    reason: "Termin verschoben",
    moves: [{ taskId: "a", date: next, time: "09:00" }],
  };
  await tool("semester_reschedule", single);
  check(
    (await tool("semester_reschedule", single)).replayed,
    "Single move retry is idempotent",
  );
  const multi = {
    moduleId: "m1",
    revision: await revision(),
    idempotencyKey: crypto.randomUUID(),
    reason: "Beide Einheiten zusammenlegen",
    moves: [
      { taskId: "a", date: offsetDate(next, 1), time: "09:00" },
      { taskId: "b", date: offsetDate(next, 1), time: "11:00" },
    ],
  };
  await tool("semester_reschedule", multi);
  await tool("semester_reschedule", multi);
  snap = (await snapshot(owner)).data;
  check(
    snap.tasks.length === 2 &&
      snap.tasks.every(
        (t) =>
          t.sourceMaterialId === "pdf" &&
          t.sourcePageStart === 2 &&
          t.sourcePageEnd === 3 &&
          t.sourceExercise === "1b",
      ),
    "Repeated multi-move keeps IDs, all sources and exactly two blocks",
  );
  check(
    JSON.stringify(snap.topics.map(topic => ({ ...topic, lastPracticed: undefined }))) ===
      JSON.stringify(
        JSON.parse(originalTopics).map(
          (topic: Record<string, unknown>) => ({ ...topic, lastPracticed: undefined }),
        ),
      ),
    "Topics persist independently of moved blocks",
  );
  check(
    snap.topics.find((t) => t.id === "tm1")?.status === "nicht begonnen" &&
      snap.sessions.length === 1 &&
      snap.sessions[0].minutes === 25,
    "Rescheduling preserves feedback and never marks a topic mastered",
  );
  check(
    JSON.stringify(snap.plans) === originalPlans &&
      JSON.stringify(snap.deadlines) === originalDeadlines,
    "Single and multi moves leave budgets and exam dates unchanged",
  );
  const raceRevision = await revision();
  const competingMoves = await Promise.all(
    ["11:30", "12:30"].map(async (time) => {
      const response = await rpc("tools/call", {
        name: "semester_reschedule",
        arguments: {
          ...multi,
          revision: raceRevision,
          idempotencyKey: crypto.randomUUID(),
          reason: "Konkurrierende Testverschiebung",
          moves: [{ taskId: "b", date: offsetDate(next, 1), time }],
        },
      });
      const body = await response.json();
      return {
        error: body.result.isError,
        value: JSON.parse(body.result.content[0].text),
      };
    }),
  );
  check(
    competingMoves.filter((r) => !r.error).length === 1 &&
      competingMoves.filter((r) => r.error && r.value.status === 409).length ===
        1 &&
      (await revision()) === raceRevision + 1,
    "Concurrent MCP reschedules commit exactly once and reject the stale writer",
  );
  const context = await tool("semester_module_context", { moduleId: "m1" });
  check(
    context.module.learningNotes &&
      context.currentPlan.length === 2 &&
      context.materials.length === 1 &&
      context.latestFeedback.id === "report-1" &&
      context.nextStep === feedback.nextStep,
    "Fresh Fachchat obtains rules, plan, material references, latest report and next step using MCP alone",
  );
  check(
    context.topicOverview[0].sources[0].sourceMaterialId === "pdf" &&
      context.coverage.includes("nicht"),
    "Context retains original sources and does not claim verified coverage",
  );
  check(
    context.feedbackContract.requiredAfterLearning &&
      context.continuation.feedbackId === feedback.feedbackId &&
      context.continuation.topicId === feedback.topicId &&
      context.continuation.text === feedback.nextStep,
    "New Fachchat receives feedback contract and next step with exact provenance",
  );
  check(
    context.roadmap.current.length === 1 &&
      !context.roadmap.curriculum.coverageVerified,
    "Roadmap links upcoming blocks to persistent topics without claiming coverage",
  );
  check(
    context.planChanges.some((c: { reason: string }) => c.reason === multi.reason),
    "Move reason is persisted in existing audit and module context",
  );
  const list = await tool("semester_list", { entity: "tasks", moduleId: "m1" });
  check(
    list.data.length === 2,
    "Module filter resolves tasks via persistent topic IDs",
  );
  check(
    (await tool("semester_list", { entity: "tasks", moduleId: "m2" })).data
      .length === 0,
    "Module filter excludes another subject",
  );
  await tool(
    "semester_reschedule",
    {
      ...multi,
      revision: await revision(),
      idempotencyKey: crypto.randomUUID(),
      moves: [{ taskId: "a", date: next, time: "09:00", minutes: 120 }],
    },
    409,
  );
  check(
    JSON.stringify((await snapshot(owner)).data.plans) === originalPlans,
    "Budget conflict is rejected without increasing any budget",
  );
  await batch([{ entity: "plans", action: "delete", id: start + "m1" }]);
  await tool(
    "semester_reschedule",
    {
      ...multi,
      revision: await revision(),
      idempotencyKey: crypto.randomUUID(),
      moves: [{ taskId: "a", date: todayDate, time: "09:00" }],
    },
    409,
  );
  await batch([
    {
      entity: "plans",
      action: "create",
      data: JSON.parse(originalPlans).find((p: { id: string }) => p.id === start + "m1"),
    },
  ]);
  await tool(
    "semester_reschedule",
    {
      ...multi,
      moduleId: "m2",
      revision: await revision(),
      idempotencyKey: crypto.randomUUID(),
    },
    403,
  );
  await tool(
    "semester_reschedule",
    {
      ...multi,
      revision: await revision(),
      idempotencyKey: crypto.randomUUID(),
      moves: [{ taskId: "a", date: offsetDate(today(), 20), time: "09:00" }],
    },
    422,
  );
  await tool(
    "semester_reschedule",
    {
      ...multi,
      revision: await revision(),
      idempotencyKey: crypto.randomUUID(),
      moves: [multi.moves[0], multi.moves[0]],
    },
    422,
  );
  await tool(
    "semester_reschedule",
    { ...multi, revision: 0, idempotencyKey: crypto.randomUUID() },
    409,
  );
  await tool(
    "semester_write_batch",
    {
      revision: await revision(),
      idempotencyKey: crypto.randomUUID(),
      moduleScope: "m1",
      operations: [
        {
          entity: "plans",
          action: "update",
          id: start + "m1",
          data: { targetMinutes: 900 },
        },
      ],
    },
    403,
  );
  for (const name of ["semester_module_feedback", "semester_reschedule"])
    check(
      (await rpc("tools/call", { name, arguments: {} }, read)).status === 403,
      "Read-only cannot call " + name,
    );
  check(
    (
      await rpc(
        "tools/call",
        { name: "semester_module_context", arguments: { moduleId: "m1" } },
        null,
      )
    ).status === 401,
    "Anonymous module context denied",
  );
  const foreignResult = await (
    await rpc(
      "tools/call",
      { name: "semester_module_context", arguments: { moduleId: "m1" } },
      foreign,
    )
  ).json();
  check(
    foreignResult.result.isError,
    "Other workspace cannot read module context",
  );
  await tool("semester_module_feedback", {
    ...feedback,
    feedbackId: "report-2",
    minutes: undefined,
    completed: true,
    assistance: "selbstständig",
    revision: await revision(),
    idempotencyKey: crypto.randomUUID(),
  });
  snap = (await snapshot(owner)).data;
  check(
    snap.sessions.find((s) => s.id === "report-2")?.minutes === 0 &&
      weekSummary(snap, start, "m1").documented === 25,
    "Unknown time does not invent or double count minutes",
  );
  check(
    topicStage(snap, snap.topics.find((t) => t.id === "tm1")!) === "bearbeitet",
    "Independent feedback and task completion still do not prove mastery",
  );
  // End-to-end: Today selects the block; a fresh chat reads its source/context,
  // posts its report, verifies it, and Today advances to the next stored block.
  await batch([
    {
      entity: "tasks",
      action: "create",
      data: {
        ...snap.tasks.find((t) => t.id === "a"),
        id: "daily",
        date: todayDate,
        time: "14:00",
        minutes: 30,
        status: "offen",
      },
    },
  ]);
  snap = (await snapshot(owner)).data;
  const daily = nextLearningBlocks(snap)[0];
  const handoff = fachchatPrompt(snap, daily);
  check(
    daily.id === "daily" &&
      handoff.includes('taskId="daily"') &&
      handoff.includes("semester_module_context") &&
      handoff.includes("semester_material_download"),
    "Heute handoff identifies current block, fresh context and original materials",
  );
  const fresh = await tool("semester_module_context", { moduleId: "m1" });
  check(
    fresh.tasks.find((t: { id: string; sourceMaterialId: string }) => t.id === daily.id)?.sourceMaterialId === "pdf",
    "Fresh chat resolves selected block's original source using only MCP",
  );
  const close = await tool("semester_module_feedback", {
    ...feedback,
    feedbackId: "daily-report",
    taskId: daily.id,
    minutes: 20,
    nextStep: "Schlüsselbeziehungen am nächsten Beispiel überprüfen",
    completed: true,
    revision: fresh.revision,
    idempotencyKey: crypto.randomUUID(),
  });
  const reread = await tool(close.verifyWith.tool, close.verifyWith.arguments);
  check(
    reread.sessions.some(
      (s: { id: string; taskId: string; minutes: number }) =>
        s.id === close.feedbackReceipt.feedbackId &&
        s.taskId === daily.id &&
        s.minutes === 20,
    ) && reread.continuation.feedbackId === "daily-report",
    "Saved report is verified from fresh MCP context and supplies the next learning step",
  );
  snap = (await snapshot(owner)).data;
  check(
    nextLearningBlocks(snap)[0]?.id === "b" &&
      nextLearningBlocks(snap).every((t) => t.status === "offen"),
    "Completed Today block reveals next future block without duplicating or losing topics",
  );
  check(
    snap.tasks.find((t) => t.id === daily.id)?.sourceMaterialId === "pdf" &&
      JSON.stringify(snap.plans) === originalPlans &&
      topicStage(snap, snap.topics.find((t) => t.id === "tm1")!) ===
        "bearbeitet",
    "Full feedback flow preserves original sources, budgets and mastery boundary",
  );
  await batch([
    {
      entity: "tasks",
      action: "update",
      id: "b",
      data: { status: "erledigt" },
    },
  ]);
  const pending = await tool("semester_module_context", { moduleId: "m1" });
  check(
    pending.pendingFeedback.length === 1 &&
      pending.pendingFeedback[0].taskId === "b" &&
      risks((await snapshot(owner)).data).length === 0,
    "Missing block feedback is visible without a false risk warning",
  );
  await batch([
    { entity: "tasks", action: "update", id: "b", data: { status: "offen" } },
  ]);
  await batch([
    {
      entity: "topics",
      action: "update",
      id: "tm1",
      data: { status: "sicher" },
    },
    {
      entity: "tests",
      action: "create",
      data: {
        id: "test-1",
        topicId: "tm1",
        date: new Date().toISOString(),
        score: 90,
        independent: true,
        notes: "Eigener Testnachweis",
      },
    },
  ]);
  snap = (await snapshot(owner)).data;
  check(
    topicStage(snap, snap.topics.find((t) => t.id === "tm1")!) ===
      "selbstständig bestätigt",
    "Existing explicit independent test rule still confirms mastery",
  );
  const roadmapFixture = structuredClone(snap);
  roadmapFixture.topics.push(
    {
      ...snap.topics[0],
      id: "unplanned",
      moduleId: "m1",
      status: "nicht begonnen",
      plannedStart: null,
      plannedEnd: null,
    },
    {
      ...snap.topics[0],
      id: "later",
      moduleId: "m1",
      status: "nicht begonnen",
      plannedStart: offsetDate(today(), 100),
      plannedEnd: offsetDate(today(), 110),
    },
  );
  const roadmap = moduleRoadmap(roadmapFixture, "m1");
  const grouped = [
    ...roadmap.confirmed,
    ...roadmap.current,
    ...roadmap.outlook,
  ].map((t) => t.id);
  check(
    roadmap.confirmed.some((t) => t.id === "tm1") &&
      roadmap.outlook.length === 2 &&
      new Set(grouped).size === grouped.length &&
      grouped.length === 3,
    "Roadmap partitions confirmed, current and outlook topics without loss or duplicates",
  );
  check(
    roadmap.unplannedTopicIds.includes("unplanned") &&
      roadmap.afterExamTopicIds.includes("later"),
    "Unplanned topics and an outlook extending past the exam are explicit",
  );
  check(
    ["mathematik", "finance", "rechnungswesen"].every(
      (id) =>
        curriculumPolicy({ ...snap.modules[0], id }).basis ===
        "vorhandener Stoff",
    ),
    "Math, FOF and accounting reuse the existing syllabus as planning basis",
  );
  check(
    ["software-engineering", "geschaeftsprozessmanagement"].every(
      (id) =>
        curriculumPolicy({ ...snap.modules[0], id }).unknownContentExpected &&
        !curriculumPolicy({ ...snap.modules[0], id }).coverageVerified,
    ),
    "SE and process management explicitly expect currently unknown content",
  );
  await batch(
    [{ entity: "tasks", action: "update", id: "b", data: { minutes: 200 } }],
    { reason: "Zentrale Planung zeigt Konflikt" },
  );
  snap = (await snapshot(owner)).data;
  check(
    planningWarnings(snap, next).length > 0 &&
      JSON.stringify(snap.plans) === originalPlans,
    "Central overbooking is visible and never silently expands budgets",
  );
  check(
    proposeWeek(snap, next).tasks.length === 0,
    "Proposal cannot add work to an overbooked week",
  );
  check(
    fachchatPrompt(snap, snap.tasks[0]).includes('taskId="a"') &&
      fachchatPrompt(snap, snap.tasks[0]).includes('moduleId="m1"'),
    "Copied Fachchat text contains explicit identifiers",
  );
  console.log(
    `\n${count} study planning checks passed (local).`,
  );
} finally {
  for (const o of [owner, other])
    await db().batch(
      [
        "sessions",
        "tests",
        "gaps",
        "reviews",
        "history",
        "tasks",
        "materials",
        "plans",
        "deadlines",
        "topics",
        "modules",
        "audit",
        "tokens",
        "requests",
        "workspaces",
      ].map((t) =>
        db().prepare(`DELETE FROM "${t}" WHERE "ownerId"=?`).bind(o),
      ),
    );
  await databasePool().end();
  await server?.stop();
  await engine?.close();
}

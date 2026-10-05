import "./local-only";
// Local only. No live mode, env files, Supabase calls or persistent database.
import assert from "node:assert/strict";
import { mock } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { today, offsetDate, monday, type Snapshot } from "../lib/model";
import { timetableBlocks, overlaps, layoutBlocks } from "../lib/timetable";
import { timetableEventSchema } from "../lib/timetable-validation";
import { proposeWeek } from "../lib/planner";
import { weekSummary } from "../lib/study-planning";
const fixture: Snapshot = {
  modules: [{ id: "m", title: "Rechnungswesen", code: "RW", color: "#6955d8", credits: 5, examDate: null, target: 70 }],
  topics: [{ id: "t", moduleId: "m", title: "PRIVATE LEARNING CONTENT", status: "nicht begonnen", priority: 3, relevance: 3, lastPracticed: null }],
  tasks: [], tests: [], gaps: [], sessions: [], reviews: [], deadlines: [], plans: [], history: [],
  timetableEvents: [{ id: "lecture", moduleId: "m", kind: "Vorlesung", date: "2026-10-19", time: "10:00", minutes: 90, location: "R1", intervalWeeks: 1, until: "2026-11-30", exceptions: [] }],
};
let checks = 0;
function check(ok: unknown, label: string) { assert.ok(ok, label); checks++; console.log("PASS", label); }
const before = JSON.stringify(fixture);
let blocks = timetableBlocks(fixture, "2026-10-19", "2026-11-03");
check(blocks.length === 3 && blocks.every(b => b.start.endsWith("T10:00") && b.end.endsWith("T11:30")), "weekly recurrence keeps wall time across DST");
fixture.timetableEvents![0].intervalWeeks = 2;
check(timetableBlocks(fixture, "2026-10-19", "2026-11-03").length === 2, "fortnightly recurrence");
fixture.timetableEvents![0].intervalWeeks = 1;
fixture.timetableEvents![0].exceptions = [{ originalDate: "2026-10-19", date: "2026-11-05", time: "14:00", minutes: 60, location: "R2", cancelled: false }, { originalDate: "2026-10-26", date: "2026-10-26", time: "10:00", minutes: 90, location: "R1", cancelled: true }];
check(timetableBlocks(fixture, "2026-10-19", "2026-10-27").length === 0, "moved/cancelled occurrences are not duplicated");
blocks = timetableBlocks(fixture, "2026-11-05", "2026-11-06");
check(blocks.length === 1 && blocks[0].id === "lecture@2026-10-19" && blocks[0].location === "R2", "moved exception appears outside original window with stable identity");
check(!timetableEventSchema.safeParse({ ...fixture.timetableEvents![0], exceptions: [...fixture.timetableEvents![0].exceptions, fixture.timetableEvents![0].exceptions[0]] }).success, "duplicate exceptions rejected");
check(!timetableEventSchema.safeParse({ ...fixture.timetableEvents![0], date: "2026-02-30" }).success, "invalid calendar dates rejected");
Object.assign(fixture, JSON.parse(before));
fixture.tasks.push({ id: "task", topicId: "t", title: "PRIVATE TASK CONTENT", date: "2026-10-19", time: "10:30", minutes: 60, status: "offen", kind: "Lernen", priority: 3 });
blocks = timetableBlocks(fixture, "2026-10-19", "2026-10-20");
check(blocks[1].title === "Rechnungswesen" && !JSON.stringify(blocks).includes("PRIVATE"), "learning projection exposes only module names");
check(overlaps(blocks[0], blocks[1]) && layoutBlocks(blocks).get(blocks[0].id)?.cols === 2, "overlapping blocks receive separate columns");
check(!overlaps({ start: "2026-10-19T08:00", end: "2026-10-19T10:00" }, blocks[0]), "adjacent intervals do not conflict");
fixture.tasks[0].time = "23:30";
check(timetableBlocks(fixture, "2026-10-20", "2026-10-21").some(b => b.end === "2026-10-20T00:30"), "overnight task remains visible on following day");

mock.module("next/headers", { namedExports: { cookies: async () => ({ getAll: () => [], set: () => {} }) } });
const engine = await PGlite.create();
await engine.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE SQL STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
const migrations = (await readdir("supabase/migrations")).filter(f => f.endsWith(".sql")).sort();
const timetableMigration = migrations.find(f => f.endsWith("_timetable.sql"));
assert.ok(timetableMigration, "versioned timetable migration exists");
for (const file of migrations.filter(f => f !== timetableMigration)) await engine.exec(await readFile("supabase/migrations/" + file, "utf8"));
const socket = new PGLiteSocketServer({ db: engine, host: "127.0.0.1", port: 54326, maxConnections: 1 });
await socket.start();
process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54326/postgres";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
delete process.env.COCKPIT_TIMETABLE_ENABLED;
const { initialize, snapshot, mutate, db, hash } = await import("../lib/server");
const { databasePool } = await import("../lib/postgres");
databasePool().options.max = 1;
const mcp = await import("../app/api/mcp/route");
const rest = await import("../app/api/v1/[[...path]]/route");
const owner = "local-timetable-qa", other = "local-timetable-other";
const auth = { owner, actor: "QA", browser: false, scope: "read-write" }, token = "sem_timetable_test", read = "sem_timetable_read";
async function batch(operations: unknown[], extra: object = {}) {
  return mutate(auth, { revision: (await snapshot(owner)).revision, reason: "QA", operations, ...extra }, crypto.randomUUID());
}
async function rpc(method: string, params: unknown = {}, secret = token) {
  const response = await mcp.POST(new Request("http://cockpit.test/api/mcp", { method: "POST", headers: { authorization: "Bearer " + secret, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }));
  return response.json();
}
try {
  await initialize(owner); await initialize(other);
  check((await snapshot(owner)).data.timetableEvents?.length === 0, "disabled snapshot works without new table");
  for (const [secret, scope] of [[token, "read-write"], [read, "read"]]) await db().batch([db().prepare('INSERT INTO tokens (id,"ownerId",name,hash,scope,"createdAt","expiresAt",revoked) VALUES (?,?,?,?,?,?,?,0)').bind(secret, owner, "QA", await hash(secret), scope, new Date().toISOString(), "2099-01-01T00:00:00Z")]);
  check(!(await rpc("tools/list")).result.tools.some((t: { name: string }) => t.name === "semester_timetable"), "disabled MCP does not advertise calendar tool");
  await assert.rejects(batch([{ entity: "timetableEvents", action: "create", data: fixture.timetableEvents![0] }]), { status: 404 }); checks++;
  await engine.exec(await readFile("supabase/migrations/" + timetableMigration, "utf8"));
  process.env.COCKPIT_TIMETABLE_ENABLED = "1";
  const day = today(), week = monday(day);
  await batch([{ entity: "modules", action: "create", data: fixture.modules[0] }, { entity: "topics", action: "create", data: fixture.topics[0] }, { entity: "plans", action: "create", data: { id: "budget", moduleId: "m", title: "QA", startDate: week, endDate: offsetDate(week, 6), targetMinutes: 180, notes: "" } }, { entity: "plans", action: "create", data: { id: "total", moduleId: null, title: "QA", startDate: week, endDate: offsetDate(week, 6), targetMinutes: 180, notes: "" } }]);
  const event = { ...fixture.timetableEvents![0], date: day, time: "09:00", until: offsetDate(day, 90), exceptions: [] };
  const body = { revision: (await snapshot(owner)).revision, operations: [{ entity: "timetableEvents", action: "create", data: event }] }, key = crypto.randomUUID();
  await mutate(auth, body, key);
  check((await mutate(auth, body, key)).replayed === true, "event creation retry is idempotent");
  check((await snapshot(other)).data.timetableEvents?.length === 0, "events isolated by owner");
  check(weekSummary((await snapshot(owner)).data, week, "m").planned === 0, "lectures do not consume learning budgets");
  await assert.rejects(batch([{ entity: "timetableEvents", action: "update", id: event.id, data: { location: "other" } }], { moduleScope: "m" }), { status: 403 }); checks++;
  const task = { ...fixture.tasks[0], date: day, time: "09:30" };
  const rev = (await snapshot(owner)).revision;
  await assert.rejects(batch([{ entity: "tasks", action: "create", data: task }], { moduleScope: "m" }), { status: 409 });
  check((await snapshot(owner)).revision === rev && (await snapshot(owner)).data.tasks.length === 0, "colliding learning write rejected atomically");
  task.time = "11:00";
  await batch([{ entity: "tasks", action: "create", data: task }], { moduleScope: "m" });
  const saved = (await snapshot(owner)).data.tasks[0];
  await batch([{ entity: "tasks", action: "update", id: task.id, data: { time: "12:00" } }], { moduleScope: "m" });
  check(JSON.stringify({ ...saved, time: "12:00" }) === JSON.stringify((await snapshot(owner)).data.tasks[0]), "moving task preserves ID, topic and learning contents");
  await assert.rejects(batch([{ entity: "tasks", action: "update", id: task.id, data: { minutes: 240 } }], { moduleScope: "m" }), { status: 409 }); checks++;
  await assert.rejects(mutate(auth, { ...body, operations: [{ entity: "timetableEvents", action: "update", id: event.id, data: { location: "R2" } }] }, crypto.randomUUID()), { status: 409 }); checks++;
  const exception = { originalDate: day, date: offsetDate(day, 9), time: "14:00", minutes: 60, location: "Changed", cancelled: false };
  await batch([{ entity: "timetableEvents", action: "update", id: event.id, data: { exceptions: [exception] } }]);
  check((await snapshot(owner)).data.timetableEvents![0].exceptions[0].location === "Changed", "JSON exceptions persist and reload");
  const response = await rpc("tools/call", { name: "semester_timetable", arguments: { from: offsetDate(day, 9), to: offsetDate(day, 10), moduleId: "m" } }, read);
  check(!response.result.isError && JSON.parse(response.result.content[0].text).blocks.some((b: { id: string }) => b.id === "lecture@" + day), "read-only agent reads moved occurrence through MCP");
  const denied = await rpc("tools/call", { name: "semester_write_batch", arguments: { ...body, idempotencyKey: crypto.randomUUID() } }, read);
  check(denied.error || denied.result?.isError, "read-only agent cannot write");
  const invalid = await rpc("tools/call", { name: "semester_timetable", arguments: { from: day, to: offsetDate(day, 63) } }, read);
  check(invalid.result.isError, "unbounded calendar query rejected");
  const request = new Request(`http://cockpit.test/api/v1/timetable?from=${day}&to=${offsetDate(day, 14)}`, { headers: { authorization: "Bearer " + read } });
  const r = await rest.GET(request, { params: Promise.resolve({ path: ["timetable"] }) });
  check(r.status === 200 && !(await r.text()).includes("PRIVATE"), "REST calendar projection hides contents");
  await assert.rejects(mutate({ ...auth, scope: "read" }, body, key), { status: 403 }); checks++;
  check((await engine.query<{ enabled: boolean }>("SELECT relrowsecurity AS enabled FROM pg_class WHERE oid = 'semester.\"timetableEvents\"'::regclass")).rows[0].enabled, "table has RLS");
  for (const role of ["anon", "authenticated"]) {
    await engine.exec("SET ROLE " + role);
    try { await assert.rejects(engine.query('SELECT * FROM semester."timetableEvents"'), /permission denied/); checks++; }
    finally { await engine.exec("RESET ROLE"); }
  }
  const planning = (await snapshot(owner)).data;
  planning.timetableEvents = [{ ...event, date: monday(offsetDate(day, 7)), intervalWeeks: 0, until: null }];
  planning.tasks = []; planning.plans = planning.plans.map(p => ({ ...p, startDate: planning.timetableEvents![0].date, endDate: offsetDate(planning.timetableEvents![0].date, 6) }));
  const proposal = proposeWeek(planning, planning.timetableEvents[0].date);
  const lectures = timetableBlocks({ ...planning, tasks: [] }, planning.timetableEvents[0].date, offsetDate(planning.timetableEvents[0].date, 7));
  check(proposal.tasks.length > 0 && !timetableBlocks({ ...planning, tasks: proposal.tasks }, planning.timetableEvents[0].date, offsetDate(planning.timetableEvents[0].date, 7)).filter(b => b.kind === "Lernzeit").some(b => lectures.some(l => overlaps(b, l))), "week proposal skips lecture slots");
  delete process.env.COCKPIT_TIMETABLE_ENABLED;
  check((await snapshot(owner)).data.tasks.length === 1 && (await snapshot(owner)).data.timetableEvents?.length === 0, "disabling feature retains original learning data");
  check((await engine.query<{ n: number }>('SELECT count(*) AS n FROM semester."timetableEvents"')).rows[0].n === 1, "disabling feature retains stored events for reactivation");
  console.log(`PASS ${checks} timetable checks`);
} finally {
  await databasePool().end(); await socket.stop(); await engine.close();
}

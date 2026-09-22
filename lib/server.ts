import { ZodError } from "zod";
import { assertPrivateBackend } from "./runtime-mode";
import { createClient } from "@supabase/supabase-js";
import { database } from "./postgres";
import { supabaseServer } from "./supabase/server";
import { allowedUser, isSameOrigin, ownerSessionUser } from "./auth";
import {
  entities,
  progress,
  mastered,
  risks,
  today,
  offsetDate,
  monday,
  type Snapshot,
  type Entity,
} from "./model";
import { schemas, batchSchema, type Operation } from "./validation";
import { planningHorizon, planningWarnings, weekSummary } from "./study-planning";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Auth = {
  owner: string;
  actor: string;
  scope: string;
  browser: boolean;
};
export function db() {
  assertPrivateBackend();
  if (!process.env.DATABASE_URL)
    throw new ApiError(
      503,
      "Die Datenbank ist momentan nicht erreichbar. Bitte erneut versuchen.",
    );
  return database;
}
export async function hash(s: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function authorize(
  request: Request,
  write = false,
): Promise<Auth> {
  assertPrivateBackend();
  const bearer = request.headers.get("authorization");
  if (bearer) {
    if (!bearer.startsWith("Bearer "))
      throw new ApiError(401, "Ungültiger Agent-Schlüssel.");
    const secret = bearer.slice(7);
    if (!secret.startsWith("sem_")) {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: { user }, error } = await supabase.auth.getUser(secret);
      const { data: verified } = await supabase.auth.getClaims(secret);
      if (error || !user || !verified?.claims || !allowedUser(user)) throw new ApiError(401, "Ungültige oder abgelaufene Anmeldung.");
      const clientId = verified.claims.client_id;
      if (!clientId || typeof clientId !== "string") throw new ApiError(401, "Bitte den Agenten über die OAuth-Verbindung anmelden.");
      const grant = await db().prepare("SELECT scope FROM oauth_grants WHERE ownerId=? AND client_id=? AND revoked=0").bind(user.id, clientId).first();
      if (!grant || (write && grant.scope !== "read-write")) throw new ApiError(403, "Diese Verbindung hat keine passende Freigabe.");
      return { owner: user.id, actor: "Agent: " + clientId, scope: grant.scope, browser: false };
    }
    const token = await db()
      .prepare(
        "SELECT * FROM tokens WHERE hash=? AND revoked=0 AND expiresAt>?",
      )
      .bind(await hash(secret), new Date().toISOString())
      .first<{ ownerId: string; name: string; scope: string }>();
    if (!token)
      throw new ApiError(
        401,
        "Agent-Schlüssel fehlt, ist abgelaufen oder wurde widerrufen.",
      );
    if (write && token.scope !== "read-write")
      throw new ApiError(403, "Dieser Agent darf nur lesen.");
    return {
      owner: token.ownerId,
      actor: "Agent: " + token.name,
      scope: token.scope,
      browser: false,
    };
  }
  const supabase = await supabaseServer();
  const user = await ownerSessionUser(supabase);
  if (!user) throw new ApiError(401, "Bitte im Cockpit anmelden.");
  const owner = user.id;
  if (write) {
    if (!isSameOrigin(request))
      throw new ApiError(403, "Fremde Herkunft nicht erlaubt.");
  }
  return { owner, actor: "Nutzer", scope: "read-write", browser: true };
}
function insert(
  entity: string,
  row: Record<string, unknown>,
  owner: string,
  now: string,
) {
  const values: Record<string, unknown> = {
    ...row,
    ownerId: owner,
    updatedAt: now,
  };
  const keys = Object.keys(values);
  return db()
    .prepare(
      `INSERT INTO "${entity}" (${keys.map((k) => '"' + k + '"').join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    )
    .bind(
      ...keys.map((k) =>
        typeof values[k] === "boolean" ? Number(values[k]) : values[k],
      ),
    );
}
export async function initialize(owner: string) {
  if (
    await db()
      .prepare("SELECT ownerId FROM workspaces WHERE ownerId=?")
      .bind(owner)
      .first()
  )
    return;
  const now = new Date().toISOString();
  const statements = [
    db()
      .prepare(
        "INSERT INTO workspaces (ownerId,revision,createdAt) VALUES (?,0,?)",
      )
      .bind(owner, now),
  ];
  try {
    await db().batch(statements);
  } catch (e) {
    if (
      !(await db()
        .prepare("SELECT ownerId FROM workspaces WHERE ownerId=?")
        .bind(owner)
        .first())
    )
      throw e;
  }
}
export async function snapshot(owner: string) {
  const queries = [
    db().prepare("SELECT revision FROM workspaces WHERE ownerId=?").bind(owner),
    ...entities.map((e) =>
      db()
        .prepare(`SELECT * FROM "${e}" WHERE ownerId=? ORDER BY id`)
        .bind(owner),
    ),
  ];
  const results = await db().batch(queries);
  if (!results[0].results[0])
    throw new ApiError(404, "Semester noch nicht eingerichtet.");
  const data = {} as Snapshot;
  entities.forEach((e, i) => {
    (data[e] as unknown[]) = results[i + 1].results.map((row) => {
      const value = { ...row };
      delete value.ownerId; delete value.updatedAt;
      if (e === "tests") value.independent = !!value.independent;
      return value;
    });
  });
  return { revision: Number(results[0].results[0].revision), data };
}
export function analysis(data: Snapshot) {
  const date = today();
  return {
    asOf: date,
    masteryRule:
      "Themenstatus sicher UND neuester Test >=80 % ohne Hilfe. Selbsteinschätzung ist kein Nachweis.",
    progress: progress(data),
    modules: data.modules.map((m) => ({
      ...m,
      progress: progress(data, m.id),
      behind: risks(data).some(t => t.moduleId === m.id),
    })),
    masteredTopics: data.topics.filter((t) => mastered(data, t)),
    atRisk: risks(data),
    neglected: risks(data).filter(t => !!t.lastPracticed && t.lastPracticed < offsetDate(date, -10)),
    planningWarnings: planningWarnings(data),
    dueReviews: data.reviews.filter(
      (r) => r.status === "offen" && r.date <= date,
    ),
    openGaps: data.gaps.filter((g) => g.status === "offen"),
    todayTasks: data.tasks.filter((t) => t.date === date),
    overdueTasks: data.tasks.filter(
      (t) => t.date < date && t.status === "offen",
    ),
    deadlines: data.deadlines
      .filter((d) => d.date >= date)
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
// Dynamic entity dispatch is validated by schemas[entity] before persistence. This alias
// is confined to the heterogeneous draft/audit bridge, not external request validation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MutationRow = { id: string; [field: string]: any };

export async function mutate(auth: Auth, body: unknown, key: string | null) {
  if (!key || key.length > 100 || key.length < 8)
    throw new ApiError(
      400,
      "Ein Idempotency-Key mit 8–100 Zeichen ist erforderlich.",
    );
  const parsed = batchSchema.parse(body);
  const bodyHash = await hash(JSON.stringify(parsed));
  const replay = async () => {
    const p = await db()
      .prepare("SELECT hash,response FROM requests WHERE ownerId=? AND key=?")
      .bind(auth.owner, key)
      .first<{ hash: string; response: string }>();
    if (!p) return null;
    if (p.hash !== bodyHash)
      throw new ApiError(
        409,
        "Dieser Idempotency-Key wurde mit anderen Daten verwendet.",
      );
    return JSON.parse(p.response);
  };
  const previous = await replay();
  if (previous) return { ...previous, replayed: true };
  const current = await snapshot(auth.owner);
  if (current.revision !== parsed.revision)
    throw new ApiError(
      409,
      "Die Daten wurden inzwischen geändert. Bitte neu laden und erneut planen.",
    );
  const draft = structuredClone(current.data);
  const changes: {
    entity: Entity;
    action: string;
    id: string;
    before: MutationRow | null;
    after: MutationRow | null;
  }[] = [];
  const now = new Date().toISOString();
  function apply(
    op: Operation | { entity: "history"; action: "create"; data: Record<string, unknown> },
  ) {
    const entity = op.entity;
    const list = draft[entity] as MutationRow[];
    const opid = (("id" in op ? op.id : undefined) || op.data?.id || crypto.randomUUID()) as string;
    const idx = list.findIndex((x) => x.id === opid);
    const before = idx < 0 ? null : structuredClone(list[idx]);
    if (op.action === "create" && idx >= 0)
      throw new ApiError(409, "Eine ID existiert bereits: " + opid);
    if (op.action !== "create" && idx < 0)
      throw new ApiError(404, "Datensatz nicht gefunden: " + opid);
    if (op.action === "delete") {
      list.splice(idx, 1);
      changes.push({
        entity,
        action: op.action,
        id: opid,
        before,
        after: null,
      });
      return;
    }
    if (op.data?.id && op.data.id !== opid)
      throw new ApiError(400, "IDs können nicht geändert werden.");
    const row = schemas[entity].parse({ ...before, ...op.data, id: opid });
    if (entity === "topics") {
      const topic = row as Snapshot["topics"][number];
      if (topic.plannedEnd && (!topic.plannedStart || topic.plannedEnd < topic.plannedStart))
        throw new ApiError(422, "Der Themenzeitraum benötigt einen Beginn vor dem Ende.");
    }
    if (entity === "tasks") {
      const task = row as Snapshot["tasks"][number];
      if ((!before || before.date !== task.date) && task.date > planningHorizon())
        throw new ApiError(422, "Konkrete Lernblöcke bitte nur für die nächsten 14 Tage planen. Für später den Themenzeitraum verwenden. Bestehende spätere Blöcke bleiben erhalten.");
    }
    if (entity === "sessions" && !before) (row as Snapshot["sessions"][number]).recordedAt = now;
    if (entity === "plans" && (row as Snapshot["plans"][number]).endDate < (row as Snapshot["plans"][number]).startDate)
      throw new ApiError(400, "Das Planende muss nach dem Beginn liegen.");
    if (entity === "plans" && (row as Snapshot["plans"][number]).moduleId && ((row as Snapshot["plans"][number]).startDate !== monday((row as Snapshot["plans"][number]).startDate) || (row as Snapshot["plans"][number]).endDate !== offsetDate((row as Snapshot["plans"][number]).startDate, 6)))
      throw new ApiError(422, "Ein Fachbudget gilt für eine Woche von Montag bis Sonntag.");
    if (entity === "tests")
      (row as Snapshot["tests"][number]).date = new Date((row as Snapshot["tests"][number]).date).toISOString();
    if (entity === "tests" && (row as Snapshot["tests"][number]).date > now)
      throw new ApiError(
        400,
        "Testergebnisse dürfen nicht in der Zukunft liegen.",
      );
    if (entity === "sessions" && (row as Snapshot["tests"][number]).date > today())
      throw new ApiError(400, "Lernzeit darf nicht in der Zukunft liegen.");
    if (idx < 0) list.push(row);
    else list[idx] = row;
    changes.push({ entity, action: op.action, id: opid, before, after: row });
    if (
      entity === "topics" &&
      (!before || before.status !== (row as Snapshot["topics"][number]).status)
    )
      apply({
        entity: "history",
        action: "create",
        data: {
          topicId: row.id,
          date: now,
          status: (row as Snapshot["topics"][number]).status,
          source: auth.actor,
        },
      });
  }
  parsed.operations.forEach(apply);
  for (const c of changes.filter(c => c.entity === "plans" && c.after)) {
    const p = c.after!;
    if (p.startDate === monday(p.startDate) && p.endDate === offsetDate(p.startDate, 6) && draft.plans.some(other => other.id !== p.id && (other.moduleId || null) === (p.moduleId || null) && other.startDate === p.startDate && other.endDate === p.endDate))
      throw new ApiError(409, "Für dieses Fach oder die Gesamtwoche gibt es bereits ein Budget. Bitte den bestehenden Plan aktualisieren.");
  }
  if (parsed.moduleScope) {
    const moduleId = parsed.moduleScope;
    if (!draft.modules.some(m => m.id === moduleId)) throw new ApiError(404, "Modul nicht gefunden.");
    for (const c of changes) {
      if (c.entity === "history") continue;
      if (!["tasks", "topics", "tests", "gaps", "sessions", "reviews"].includes(c.entity))
        throw new ApiError(403, "Budgets und fachübergreifende Änderungen gehören in die zentrale Semesterplanung.");
      for (const row of [c.before, c.after].filter((row): row is MutationRow => row !== null)) {
        const belongs = c.entity === "topics" ? row.moduleId : draft.topics.find(t => t.id === row.topicId)?.moduleId;
        if (belongs !== moduleId) throw new ApiError(403, "Der Fachchat darf nur sein Modul ändern.");
      }
    }
    const moved = changes.filter(c => c.entity === "tasks" && c.after && (!c.before || ["date", "time", "minutes"].some(k => c.before![k] !== c.after![k])));
    for (const start of new Set(moved.map(c => monday(c.after!.date)))) {
      const next = weekSummary(draft, start, moduleId), old = weekSummary(current.data, start, moduleId);
      if (next.budget === null) throw new ApiError(409, "Für diese Woche fehlt ein eindeutiges Fachbudget. Bitte zuerst in der zentralen Semesterplanung festlegen.");
      if (next.overBy > old.overBy) throw new ApiError(409, `Das Fachbudget würde um ${next.overBy} Min. überschritten. Kürzen oder zentral umplanen; das Budget wird nicht erhöht.`);
      const total = weekSummary(draft, start), oldTotal = weekSummary(current.data, start);
      if (total.ambiguous || total.overBy > oldTotal.overBy) throw new ApiError(409, "Das Gesamtbudget dieser Woche passt nicht. Bitte zentral umplanen.");
    }
  }
  // Maintain shared derived practice dates for both UI and agent writes.
  for (const t of draft.topics) {
    const evidenceDates = [
      ...draft.tests
        .filter((x) => x.topicId === t.id)
        .map((x) =>
          new Intl.DateTimeFormat("sv-SE", {
            timeZone: "Europe/Berlin",
          }).format(new Date(x.date)),
        ),
      ...draft.sessions.filter((x) => x.topicId === t.id).map((x) => x.date),
    ];
    const last = evidenceDates.sort().at(-1);
    if (last && (!t.lastPracticed || last > t.lastPracticed))
      apply({
        entity: "topics",
        action: "update",
        id: t.id,
        data: { lastPracticed: last },
      });
  }
  // The canonical exam date on a module and its canonical exam deadline stay aligned.
  for (const changed of [...changes]) {
    if (changed.entity === "modules" && changed.after) {
      const m = changed.after;
      const deadline = draft.deadlines.find((d) => d.id === "exam-" + m.id);
      if (!m.examDate) {
        if (deadline) apply({ entity: "deadlines", action: "delete", id: deadline.id });
      } else if (deadline) {
        if (
          deadline.date !== m.examDate ||
          deadline.title !== "Klausur " + m.title
        )
          apply({
            entity: "deadlines",
            action: "update",
            id: deadline.id,
            data: { date: m.examDate, title: "Klausur " + m.title },
          });
      } else
        apply({
          entity: "deadlines",
          action: "create",
          data: {
            id: "exam-" + m.id,
            moduleId: m.id,
            title: "Klausur " + m.title,
            date: m.examDate,
            kind: "Klausur",
          },
        });
    }
  }
  for (const op of parsed.operations) {
    if (op.entity === "deadlines" && op.action === "update") {
      const d = draft.deadlines.find((x) => x.id === op.id);
      if (d && d.id === "exam-" + d.moduleId) {
        const m = draft.modules.find((x) => x.id === d.moduleId);
        if (m && m.examDate !== d.date)
          apply({
            entity: "modules",
            action: "update",
            id: m.id,
            data: { examDate: d.date },
          });
      }
    }
  }
  // References are validated against the final batch state, including newly created parents.
  for (const e of entities)
    for (const row of draft[e] as MutationRow[]) {
      if (row.moduleId && !draft.modules.some((m) => m.id === row.moduleId))
        throw new ApiError(
          400,
          "Modulreferenz ungültig oder noch in Verwendung.",
        );
      if (row.topicId && !draft.topics.some((t) => t.id === row.topicId))
        throw new ApiError(
          400,
          "Themenreferenz ungültig oder noch in Verwendung.",
        );
    }
  // Sources share the existing task and topic/module identities; no duplicate progress.
  for (const session of draft.sessions) {
    if (session.taskId && !draft.tasks.some(t => t.id === session.taskId && t.topicId === session.topicId))
      throw new ApiError(422, "Die Rückmeldung muss auf eine bestehende Aufgabe desselben Themas verweisen.");
  }
  const materialRows = await db().prepare('SELECT id,"moduleId",state FROM materials WHERE "ownerId"=?').bind(auth.owner).all();
  for (const task of draft.tasks) {
    if (!task.sourceMaterialId && (task.sourcePageStart || task.sourcePageEnd || task.sourceExercise))
      throw new ApiError(422, "Wähle zuerst eine Quelldatei für Seiten- oder Aufgabenangaben.");
    if (task.sourcePageEnd && (!task.sourcePageStart || task.sourcePageEnd < task.sourcePageStart))
      throw new ApiError(422, "Der Seitenbereich ist ungültig.");
    if (task.sourceMaterialId) {
      const material = materialRows.results.find(m => m.id === task.sourceMaterialId);
      if (!material || material.state !== "ready" || material.moduleId !== draft.topics.find(t => t.id === task.topicId)?.moduleId)
        throw new ApiError(422, "Die Quelldatei muss zum Modul der Aufgabe gehören und fertig hochgeladen sein.");
    }
  }
  if (materialRows.results.some(m => !draft.modules.some(module => module.id === m.moduleId)))
    throw new ApiError(409, "Lösche zuerst die Materialien dieses Moduls.");
  const result = {
    revision: current.revision + 1,
    changed: changes.map((c) => ({
      entity: c.entity,
      id: c.id,
      action: c.action,
    })),
    replayed: false,
    planningWarnings: [...new Set(draft.tasks.map(t => monday(t.date)))].filter(start => start >= monday(today())).flatMap(start => planningWarnings(draft, start).map(warning => `${start}: ${warning}`)),
  };
  // CHECK constraint aborts the entire PostgreSQL transaction on stale writes.
  const statements = [
    db()
      .prepare(
        "UPDATE workspaces SET revision=CASE WHEN revision=? THEN revision+1 ELSE -1 END WHERE ownerId=?",
      )
      .bind(current.revision, auth.owner),
  ];
  // PostgreSQL foreign keys are deferred until the transaction is committed.
  for (const c of changes) {
    if (c.action === "delete")
      statements.push(
        db()
          .prepare(`DELETE FROM "${c.entity}" WHERE ownerId=? AND id=?`)
          .bind(auth.owner, c.id),
      );
    else if (c.action === "create")
      statements.push(insert(c.entity, c.after!, auth.owner, now));
    else {
      const fields = Object.keys(c.after!).filter((k) => k !== "id");
      statements.push(
        db()
          .prepare(
            `UPDATE "${c.entity}" SET ${fields.map((k) => '"' + k + '"=?').join(",")},updatedAt=? WHERE ownerId=? AND id=?`,
          )
          .bind(
            ...fields.map((k) =>
              typeof c.after![k] === "boolean" ? Number(c.after![k]) : c.after![k],
            ),
            now,
            auth.owner,
            c.id,
          ),
      );
    }
    statements.push(
      db()
        .prepare(
          "INSERT INTO audit (id,ownerId,date,actor,entity,entityId,action,before,after,revision,reason) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          auth.owner,
          now,
          auth.actor,
          c.entity,
          c.id,
          c.action,
          c.before ? JSON.stringify(c.before) : null,
          c.after ? JSON.stringify(c.after) : null,
          result.revision,
          parsed.reason || (["tasks", "plans", "topics"].includes(c.entity) ? "Änderung ohne angegebenen Grund" : ""),
        ),
    );
  }
  statements.push(
    db()
      .prepare(
        "INSERT INTO requests (ownerId,key,hash,response) VALUES (?,?,?,?)",
      )
      .bind(auth.owner, key, bodyHash, JSON.stringify(result)),
  );
  try {
    await db().batch(statements);
  } catch (e) {
    const replayed = await replay();
    if (replayed) return { ...replayed, replayed: true };
    if (String(e).includes("revision_nonnegative") || (e as { code?: string }).code === "40001")
      throw new ApiError(
        409,
        "Zeitgleiche Änderung erkannt. Bitte Daten neu laden.",
      );
    throw e;
  }
  return result;
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function failure(e: unknown) {
  if (e instanceof ZodError)
    return json({ error: "Ungültige Eingabe.", details: e.issues }, 422);
  if (e instanceof ApiError) return json({ error: e.message }, e.status);
  console.error("Semester API:", e);
  return json(
    { error: "Speichern oder Laden fehlgeschlagen. Bitte erneut versuchen." },
    503,
  );
}
export async function readBody(r: Request) {
  if (!r.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(415, "Content-Type application/json erforderlich.");
  const s = await r.text();
  if (s.length > 150000) throw new ApiError(413, "Anfrage zu groß.");
  try {
    return JSON.parse(s);
  } catch {
    throw new ApiError(400, "Ungültiges JSON.");
  }
}

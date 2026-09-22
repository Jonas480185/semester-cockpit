import { isDemoDeployment, demoBackendResponse } from "@/lib/runtime-mode";
import {
  authorize,
  snapshot,
  analysis,
  mutate,
  json,
  failure,
  db,
  hash,
  ApiError,
  readBody,
} from "@/lib/server";
import { entities, type Entity } from "@/lib/model";
import { openapi } from "@/lib/openapi";
import { z } from "zod";
async function handler(
  r: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  if (isDemoDeployment()) return demoBackendResponse();
  try {
    const a = await authorize(r, r.method !== "GET");
    const [entity, id] = (await params).path || [];
    const url = new URL(r.url);
    if (entity === "openapi.json" && r.method === "GET")
      return json(openapi(url.origin));
    if (entity === "keys") {
      if (!a.browser)
        throw new ApiError(
          403,
          "Schlüsselverwaltung nur durch den angemeldeten Nutzer.",
        );
      if (r.method === "GET")
        return json({
          data: (
            await db()
              .prepare(
                "SELECT id,name,scope,createdAt,expiresAt,revoked FROM tokens WHERE ownerId=? ORDER BY createdAt DESC",
              )
              .bind(a.owner)
              .all()
          ).results,
        });
      if (r.method === "POST") {
        const b = z
          .object({
            name: z.string().trim().min(1).max(60),
            scope: z.enum(["read", "read-write"]),
          })
          .strict()
          .parse(await readBody(r));
        const secret =
          "sem_" +
          crypto.randomUUID().replaceAll("-", "") +
          crypto.randomUUID().replaceAll("-", "");
        const keyId = crypto.randomUUID();
        const created = new Date().toISOString();
        const expires = new Date(Date.now() + 90 * 86400000).toISOString();
        await db().batch([
          db()
            .prepare(
              "INSERT INTO tokens (id,ownerId,name,hash,scope,createdAt,expiresAt,revoked) VALUES (?,?,?,?,?,?,?,0)",
            )
            .bind(
              keyId,
              a.owner,
              b.name,
              await hash(secret),
              b.scope,
              created,
              expires,
            ),
          db()
            .prepare(
              "INSERT INTO audit (id,ownerId,date,actor,entity,entityId,action,before,after,revision) VALUES (?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              crypto.randomUUID(),
              a.owner,
              created,
              "Nutzer",
              "keys",
              keyId,
              "create",
              null,
              JSON.stringify({ name: b.name, scope: b.scope }),
              0,
            ),
        ]);
        return json({ id: keyId, token: secret, expiresAt: expires }, 201);
      }
      if (r.method === "DELETE" && id) {
        const results = await db().batch([
          db()
            .prepare("UPDATE tokens SET revoked=1 WHERE ownerId=? AND id=?")
            .bind(a.owner, id),
          db()
            .prepare(
              "INSERT INTO audit (id,ownerId,date,actor,entity,entityId,action,before,after,revision) SELECT ?,ownerId,?,'Nutzer','keys',id,'update',NULL,?,0 FROM tokens WHERE ownerId=? AND id=?",
            )
            .bind(
              crypto.randomUUID(),
              new Date().toISOString(),
              JSON.stringify({ revoked: true }),
              a.owner,
              id,
            ),
        ]);
        if (!results[0].meta.changes)
          throw new ApiError(404, "Schlüssel nicht gefunden.");
        return json({ revoked: true });
      }
    }
    if (entity === "audit" && r.method === "GET") {
      const after = url.searchParams.get("after");
      return json({
        data: (
          await db()
            .prepare(
              "SELECT * FROM audit WHERE ownerId=? AND date>? ORDER BY date DESC LIMIT 200",
            )
            .bind(a.owner, after || "")
            .all()
        ).results.map(row => { const value = { ...row }; delete value.ownerId; return value; }),
      });
    }
    if (r.method === "GET") {
      const snap = await snapshot(a.owner);
      if (entity === "snapshot") return json(snap);
      if (entity === "analysis")
        return json({ revision: snap.revision, data: analysis(snap.data) });
      if (!entities.includes(entity as Entity))
        throw new ApiError(404, "Unbekannter Endpunkt.");
      let rows = snap.data[entity as Entity] as Record<string, unknown>[];
      if (id) {
        const found = rows.find((x) => x.id === id);
        if (!found) throw new ApiError(404, "Datensatz nicht gefunden.");
        return json({ revision: snap.revision, data: found });
      }
      for (const f of ["moduleId", "topicId", "status", "date"]) {
        const v = url.searchParams.get(f);
        if (v) rows = rows.filter((x) => x[f] === v || (f === "moduleId" && ((entity === "modules" && x.id === v) || snap.data.topics.some(t => t.id === x.topicId && t.moduleId === v))));
      }
      const offset = Number(url.searchParams.get("offset") || 0),
        limit = Number(url.searchParams.get("limit") || 200);
      if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 500
      )
        throw new ApiError(400, "Ungültige Seitengröße.");
      return json({
        revision: snap.revision,
        data: rows.slice(offset, offset + limit),
        total: rows.length,
        offset,
        limit,
      });
    }
    let body: unknown;
    if (entity === "batch" && r.method === "POST") body = await readBody(r);
    else {
      if (!entities.includes(entity as Entity) || entity === "history")
        throw new ApiError(
          404,
          "Unbekannter oder schreibgeschützter Endpunkt.",
        );
      const match = r.headers.get("if-match");
      if (!match || !/^"?\d+"?$/.test(match))
        throw new ApiError(428, "If-Match mit Snapshot-Revision erforderlich.");
      const action =
        r.method === "POST"
          ? "create"
          : r.method === "PATCH"
            ? "update"
            : r.method === "DELETE"
              ? "delete"
              : null;
      if (!action || ((action === "update" || action === "delete") && !id))
        throw new ApiError(405, "Operation nicht unterstützt.");
      body = {
        revision: Number(match.replaceAll('"', "")),
        operations: [
          {
            entity,
            action,
            ...(id ? { id } : {}),
            ...(action === "delete" ? {} : { data: await readBody(r) }),
          },
        ],
      };
    }
    return json(
      await mutate(a, body, r.headers.get("idempotency-key")),
      r.method === "POST" && entity !== "batch" ? 201 : 200,
    );
  } catch (e) {
    return failure(e);
  }
}
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;

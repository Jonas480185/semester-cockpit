/** Fully offline portfolio boundary checks. No credentials or live database are needed. */
import "./local-only";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { createDemoSnapshot, createDemoMaterials } from "../lib/demo/fixtures";
import { createDemoStore } from "../lib/demo/store";
import { entities, mastered } from "../lib/model";
import { schemas } from "../lib/validation";
import { assertDemoEnvironment, isDemoDeployment } from "../lib/runtime-mode";
let checks = 0;
function check(value: unknown, label: string) {
  assert.ok(value, label);
  checks++;
  console.log("PASS", label);
}
const fixture = createDemoSnapshot("2032-10-06");
for (const entity of entities) {
  for (const row of fixture[entity]) schemas[entity].parse(row);
  check(
    fixture[entity].every((r) => r.id.startsWith("demo-")),
    `${entity}: valid fictional schema and demo IDs`,
  );
}
check(
  fixture.tasks.every((t) =>
    fixture.topics.some((topic) => topic.id === t.topicId),
  ),
  "Fixture block/topic references are complete",
);
check(
  createDemoMaterials("2032-10-06").every(
    (m) =>
      m.id.startsWith("demo-") &&
      fixture.modules.some((mod) => mod.id === m.moduleId),
  ),
  "Example materials reference only fictional modules",
);
const transport = createDemoStore();
const snapshot = async () => await (await transport("/api/v1/snapshot")).json();
let state = await snapshot();
const budgets = JSON.stringify(state.data.plans);
const task = state.data.tasks.find(
  (t: { id: string }) => t.id === "demo-today-math",
);
const write = (body: unknown, key = crypto.randomUUID()) =>
  transport("/api/v1/batch", {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
const input = {
  revision: state.revision,
  operations: [
    {
      entity: "tasks",
      action: "update",
      id: task.id,
      data: { status: "erledigt" },
    },
  ],
};
const key = crypto.randomUUID();
check((await write(input, key)).ok, "Demo change stays in the in-memory store");
check(
  (await (await write(input, key)).json()).replayed,
  "Demo replay does not duplicate changes",
);
state = await snapshot();
check(
  !mastered(
    state.data,
    state.data.topics.find((t: { id: string }) => t.id === task.topicId),
  ),
  "Completing a demo task does not prove mastery",
);
check(
  JSON.stringify(state.data.plans) === budgets &&
    state.data.tasks.find((t: { id: string }) => t.id === task.id)
      .sourceMaterialId === task.sourceMaterialId,
  "Demo edit preserves budgets and source references",
);
check((await write(input)).status === 409, "Stale demo revision is rejected");
const before = JSON.stringify(state);
check(
  (
    await write({
      revision: state.revision,
      operations: [
        {
          entity: "tasks",
          action: "update",
          id: task.id,
          data: { minutes: -5 },
        },
      ],
    })
  ).status === 422 && JSON.stringify(await snapshot()) === before,
  "Invalid demo writes are atomic",
);
check(
  (await transport("/api/materials", { method: "POST", body: "{}" })).status ===
    403,
  "Demo upload endpoint has no live fallback",
);
check(
  (await transport("/api/v1/keys", { method: "POST", body: "{}" })).status ===
    403,
  "Demo cannot create real access keys",
);
check(
  (await transport("/api/unknown", { method: "POST" })).status === 403,
  "Unknown mock route never falls through to network",
);
const isolated = createDemoStore();
check(
  (await (await isolated("/api/v1/snapshot")).json()).data.tasks.find(
    (t: { id: string }) => t.id === task.id,
  ).status === "offen",
  "Each new demo tab/store begins independently",
);

process.env.COCKPIT_MODE = "demo";
check(isDemoDeployment(), "Explicit demo deployment is recognized");
delete process.env.COCKPIT_MODE;
check(isDemoDeployment(), "Missing mode is safe demo by default");
process.env.COCKPIT_MODE = "invalid";
assert.throws(() => isDemoDeployment());
checks++;
process.env.COCKPIT_MODE = "demo";
assertDemoEnvironment();
checks++;
// Deliberately fictitious canaries, never real configuration.
process.env.DATABASE_URL = "postgresql://fictional:blocked@db.invalid/blocked";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://backend.invalid";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "fictitious-do-not-connect";
assert.throws(() => assertDemoEnvironment(), /Demo must start/);
checks++;
mock.module("next/headers", {
  namedExports: {
    cookies: async () => {
      throw new Error("Cookies must never be consulted in public demo");
    },
  },
});
const originalFetch = globalThis.fetch;
let network = 0;
globalThis.fetch = async () => {
  network++;
  throw new Error("Demo attempted outbound network");
};
try {
  const { databasePool } = await import("../lib/postgres");
  const { storageAdmin } = await import("../lib/materials");
  const { supabaseServer } = await import("../lib/supabase/server");
  const { authorize, db } = await import("../lib/server");
  assert.throws(() => databasePool(), /Backend disabled/);
  checks++;
  assert.throws(() => storageAdmin(), /Backend disabled/);
  checks++;
  assert.throws(() => db(), /Backend disabled/);
  checks++;
  await assert.rejects(() => supabaseServer(), /Backend disabled/);
  checks++;
  await assert.rejects(
    () =>
      authorize(
        new Request("https://demo.invalid/api/mcp", {
          headers: { Authorization: "Bearer fake" },
        }),
      ),
    /Backend disabled/,
  );
  checks++;
  const routes = [
    ["MCP", (await import("../app/api/mcp/route")).POST],
    ["REST", (await import("../app/api/v1/[[...path]]/route")).POST],
    [
      "Materials",
      (await import("../app/api/materials/[[...path]]/route")).POST,
    ],
    ["Setup", (await import("../app/api/setup/route")).POST],
    ["Sign-in", (await import("../app/auth/sign-in/route")).POST],
    ["Sign-out", (await import("../app/auth/sign-out/route")).POST],
    ["Session import", (await import("../app/auth/session/route")).POST],
    ["Auth callback", (await import("../app/auth/callback/route")).GET],
    ["OAuth decision", (await import("../app/api/oauth/decision/route")).POST],
    ["OAuth revoke", (await import("../app/api/oauth/revoke/route")).POST],
    [
      "Discovery",
      (await import("../app/.well-known/oauth-protected-resource/route")).GET,
    ],
  ] as const;
  for (const [name, handler] of routes) {
    const response = await handler(
      new Request("https://demo.invalid/api/blocked", {
        method:
          name.includes("callback") || name === "Discovery" ? "GET" : "POST",
      }),
      { params: Promise.resolve({ path: ["snapshot"] }) },
    );
    check(
      response.status === 404 &&
        !(await response.text()).includes("backend.invalid"),
      `${name} blocks demo even without proxy and with accidental credentials`,
    );
  }
  check(
    network === 0,
    "No upstream request during negative route/constructor checks",
  );
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("../proxy");
  for (const path of [
    "/api/mcp",
    "/api/materials/anything",
    "/api/setup",
    "/auth/sign-in",
    "/oauth/consent",
    "/connections",
    "/.well-known/oauth-protected-resource",
  ])
    check(
      (await proxy(new NextRequest("https://demo.invalid" + path))).status ===
        404,
      "Proxy blocks " + path,
    );
  check(
    (await proxy(new NextRequest("https://demo.invalid/demo"))).status === 200,
    "Demo route remains reachable",
  );
} finally {
  globalThis.fetch = originalFetch;
  delete process.env.DATABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}
console.log(`\n${checks} offline demo and isolation checks passed.`);

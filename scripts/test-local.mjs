// No .env files, inherited service credentials, remote targets, or live branches.
// Each test creates and closes its own in-memory PGlite database or mocked transport.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SYSTEMROOT", "CI", "TERM"].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
env.NODE_ENV = "test";
env.COCKPIT_MODE = "private";
env.TZ = "Europe/Berlin";
const tests = [
  "tests/material-upload-client.ts",
  "tests/postgres-migration.ts",
  "tests/oauth-session-security.ts",
  "tests/study-planning.ts",
  "tests/demo.ts",
];
for (const test of tests) {
  console.log(`\nRunning ${test} (isolated local fixtures)`);
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", test], { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

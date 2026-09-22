#!/usr/bin/env node
// Dependency-free MCP stdio bridge. Node.js 22+. No credentials in source.
import { createInterface } from "node:readline";
const endpoint = process.env.SEMESTER_URL;
const token = process.env.SEMESTER_API_KEY;
const gate = process.env.SEMESTER_SITES_TOKEN;
if (!endpoint || !token) {
  process.stderr.write("SEMESTER_URL and SEMESTER_API_KEY are required.\n");
  process.exit(1);
}
const origin = new URL(endpoint);
if (
  origin.protocol !== "https:" &&
  !["localhost", "127.0.0.1"].includes(origin.hostname)
) {
  process.stderr.write("Remote servers must use HTTPS.\n");
  process.exit(1);
}
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
// Serialize requests; transport responses go only to stdout.
for await (const line of lines) {
  if (!line.trim()) continue;
  let message;
  try {
    message = JSON.parse(line);
    const response = await fetch(new URL("/api/mcp", origin), {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer " + token,
        ...(gate ? { "OAI-Sites-Authorization": "Bearer " + gate } : {}),
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(30000),
    });
    if (response.status === 202) continue;
    if (!response.ok)
      throw new Error(
        "HTTP " +
          response.status +
          ". Check agent key and private Sites gateway access.",
      );
    const result = await response.json();
    if (message.id !== undefined)
      process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    if (message?.id !== undefined)
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32000, message: error.message },
        }) + "\n",
      );
    else process.stderr.write("Invalid message or transport failure.\n");
  }
}

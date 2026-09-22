import { assertPrivateBackend } from "./runtime-mode";
import { Pool, type QueryResultRow } from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let pool: Pool | undefined;
export function databasePool() {
  assertPrivateBackend();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const url = new URL(process.env.DATABASE_URL);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("sslrootcert");
  return pool ??= new Pool({
    connectionString: url.toString(),
    ssl: local ? false : {ca: readFileSync(join(process.cwd(), "certs/supabase-ca.crt"), "utf8"), rejectUnauthorized: true},
    max: 3,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    application_name: "semester-cockpit",
  });
}

// Keep the existing parameterized query contract while moving to PostgreSQL.
// Quoted strings and identifiers are preserved; values always travel separately.
function postgresQuery(sql: string) {
  let parameter = 0;
  return sql.replace(/"(?:[^"]|"")*"|'(?:[^']|'')*'|\b(?:ownerId|updatedAt|entityId|moduleId|topicId|examDate|startDate|endDate|targetMinutes|createdAt|expiresAt|lastPracticed)\b|\?/g,
    token => token === "?" ? `$${++parameter}` : /^["']/.test(token) ? token : `"${token}"`);
}

class Statement {
  constructor(readonly sql: string, readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { return new Statement(this.sql, values); }
  async all<T extends QueryResultRow = QueryResultRow>() {
    return (await database.batch<T>([this]))[0];
  }
  async first<T extends QueryResultRow = QueryResultRow>(): Promise<T | null> {
    return (await this.all<T>()).results[0] ?? null;
  }
}

export const database = {
  prepare(sql: string) { return new Statement(sql); },
  async batch<T extends QueryResultRow = QueryResultRow>(statements: Statement[]) {
    const client = await databasePool().connect();
    try {
      // A snapshot cannot mix revisions while another request is writing.
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      await client.query("SET LOCAL search_path TO semester, pg_catalog");
      await client.query("SET CONSTRAINTS ALL DEFERRED");
      const results = [];
      for (const statement of statements) {
        const result = await client.query<T>(postgresQuery(statement.sql), statement.values);
        results.push({ results: result.rows, meta: { changes: result.rowCount ?? 0 } });
      }
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
};

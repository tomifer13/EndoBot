import { NextRequest, NextResponse } from "next/server";
import { createRequire } from "node:module";
import type DuckDB from "duckdb";

const DB_PATH = "/tmp/analytics.duckdb"; // TODO: move to persistent storage (e.g., Vercel Blob) for production
const MAX_ROWS = 50_000;
const QUERY_TIMEOUT_MS = 10_000;
const FORBIDDEN_PATTERN = /\b(ALTER|ATTACH|COPY|CREATE\s+TABLE|DELETE|DROP|GRANT|INSERT|MERGE|PRAGMA|REPLACE|TRUNCATE|UPDATE|VACUUM|WRITE|SET)\b/i;

const require = createRequire(import.meta.url);

let duckdbModule: DuckDB | null = null;

function getDuckDB(): DuckDB {
  if (!duckdbModule) {
    duckdbModule = require("duckdb") as DuckDB;
  }
  return duckdbModule;
}

export const runtime = "nodejs";

let database: DuckDB.Database | null = null;

function getDatabase(): DuckDB.Database {
  const duckdb = getDuckDB();
  if (!database) {
    database = new duckdb.Database(DB_PATH);
  }
  return database;
}

function connect(): Promise<DuckDB.Connection> {
  return new Promise((resolve, reject) => {
    getDatabase().connect((err, connection) => {
      if (err || !connection) {
        reject(err ?? new Error("Failed to connect to DuckDB"));
        return;
      }
      resolve(connection);
    });
  });
}

function prepare(connection: DuckDB.Connection, sql: string): Promise<DuckDB.Statement> {
  return new Promise((resolve, reject) => {
    connection.prepare(sql, (err, statement) => {
      if (err || !statement) {
        reject(err ?? new Error("Failed to prepare statement"));
        return;
      }
      resolve(statement);
    });
  });
}

function all(statement: DuckDB.Statement): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    statement.all((err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows ?? []);
    });
  });
}

function finalize(statement: DuckDB.Statement | null | undefined): void {
  if (!statement) {
    return;
  }
  try {
    statement.finalize();
  } catch (error) {
    console.warn("Failed to finalize DuckDB statement", error);
  }
}

function sanitizeSql(input: string): string {
  return input
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}

function isReadOnly(sql: string): boolean {
  const normalized = sql.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }
  if (FORBIDDEN_PATTERN.test(normalized)) {
    return false;
  }
  const statements = normalized
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
  if (statements.length !== 1) {
    return false;
  }
  const firstToken = statements[0].split(/\s+/)[0]?.toUpperCase();
  return firstToken === "SELECT" || firstToken === "WITH" || firstToken === "SHOW" || firstToken === "DESCRIBE";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (request.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { sql } = (await request.json().catch(() => ({}))) as { sql?: unknown };
    if (typeof sql !== "string") {
      return NextResponse.json({ error: "Missing sql" }, { status: 400 });
    }

    const sanitized = sanitizeSql(sql);
    if (!sanitized) {
      return NextResponse.json({ error: "Empty sql" }, { status: 400 });
    }

    if (!isReadOnly(sanitized)) {
      return NextResponse.json({ error: "Only read-only SELECT statements are allowed" }, { status: 400 });
    }

    const connection = await connect();
    let statement: DuckDB.Statement | null = null;

    try {
      statement = await prepare(connection, sanitized);
      const columns = typeof statement.columns === "function" ? statement.columns() : [];

      const queryPromise = all(statement);
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error("Query timed out"));
        }, QUERY_TIMEOUT_MS);
        void queryPromise.finally(() => clearTimeout(timeoutId));
      });

      const rows = await Promise.race([queryPromise, timeoutPromise]);

      const truncated = rows.length > MAX_ROWS;
      const limitedRows = truncated ? rows.slice(0, MAX_ROWS) : rows;

      return NextResponse.json({
        ok: true,
        fields: Array.isArray(columns)
          ? columns.map((column) => ({ name: column.name, type: column.type }))
          : Object.keys(limitedRows[0] ?? {}).map((name) => ({ name })),
        rows: limitedRows,
        rowCount: rows.length,
        truncated,
      });
    } finally {
      finalize(statement);
      connection.close();
    }
  } catch (error) {
    console.error("/api/sql error", error);
    const message = error instanceof Error ? error.message : String(error);
    const status = message.toLowerCase().includes("timeout") ? 504 : 500;
    return NextResponse.json(
      {
        error: "Failed to run query",
        details: message,
      },
      { status }
    );
  }
}

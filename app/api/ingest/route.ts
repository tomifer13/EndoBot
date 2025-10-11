import { NextRequest, NextResponse } from "next/server";
import AdmZip from "adm-zip";
import { createRequire } from "node:module";
import * as XLSX from "xlsx";
import type DuckDB from "duckdb";

const DB_PATH = "/tmp/analytics.duckdb"; // TODO: move to persistent storage (e.g., Vercel Blob) for production
const MAX_TOTAL_ROWS = 2_000_000;
const INSERT_CHUNK_SIZE = 1_000;

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

function run(connection: DuckDB.Connection, sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    connection.run(sql, params, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function all<T = Record<string, unknown>>(connection: DuckDB.Connection, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    connection.all(sql, params, (err, rows: T[]) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows ?? []);
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

function normalizeName(input: string, fallback: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || fallback;
}

function normalizeHeaders(headers: unknown[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((value, index) => {
    const raw = typeof value === "string" && value.trim() ? value : `column_${index + 1}`;
    const base = normalizeName(raw, `column_${index + 1}`);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    if (count === 0) {
      return base;
    }
    return `${base}_${count + 1}`;
  });
}

function ensureUniqueName(existing: Map<string, number>, candidate: string): string {
  const base = candidate;
  let suffix = existing.get(base) ?? 0;
  let resolved = base;
  while (existing.has(resolved)) {
    suffix += 1;
    resolved = `${base}_${suffix}`;
  }
  existing.set(resolved, 1);
  return resolved;
}

function formatCell(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (request.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("zip");

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing zip file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) {
      return NextResponse.json({ error: "Zip file is empty" }, { status: 400 });
    }

    const zip = new AdmZip(buffer);
    const entries = zip
      .getEntries()
      .filter((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith(".xlsx"));

    if (entries.length === 0) {
      return NextResponse.json({ error: "No .xlsx files found in archive" }, { status: 400 });
    }

    const connection = await connect();
    const usedTableNames = new Map<string, number>();
    let totalRows = 0;

    try {
      for (const entry of entries) {
        const workbook = XLSX.read(entry.getData(), { type: "buffer", cellDates: true });
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) {
            continue;
          }

          const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
            header: 1,
            raw: false,
            defval: null,
            blankrows: false,
          });

          if (!Array.isArray(rows) || rows.length === 0) {
            continue;
          }

          const [headerRow, ...dataRows] = rows;
          if (!headerRow || dataRows.length === 0) {
            continue;
          }

          if (!Array.isArray(headerRow)) {
            continue;
          }

          if (totalRows + dataRows.length > MAX_TOTAL_ROWS) {
            return NextResponse.json(
              {
                error: `Row limit exceeded. Maximum supported rows per ingest is ${MAX_TOTAL_ROWS.toLocaleString()}.`,
              },
              { status: 400 }
            );
          }

          const normalizedHeaders = normalizeHeaders(headerRow);
          const rawBase = normalizeName(entry.entryName.replace(/\.xlsx$/i, ""), "data");
          const rawSheet = normalizeName(sheetName, "sheet");
          const tableName = ensureUniqueName(usedTableNames, `${rawBase}_${rawSheet}`);

          await run(connection, `DROP TABLE IF EXISTS "${tableName}"`);
          const columnDefinitions = normalizedHeaders.map((col) => `"${col}" VARCHAR`).join(", ");
          await run(connection, `CREATE TABLE IF NOT EXISTS "${tableName}" (${columnDefinitions})`);
          await run(connection, `DELETE FROM "${tableName}"`);

          const insertSql = `INSERT INTO "${tableName}" (${normalizedHeaders
            .map((col) => `"${col}"`)
            .join(", ")}) VALUES (${normalizedHeaders.map(() => "?").join(", ")})`;
          const statement = await prepare(connection, insertSql);

          try {
            for (let offset = 0; offset < dataRows.length; offset += INSERT_CHUNK_SIZE) {
              const chunk = dataRows.slice(offset, offset + INSERT_CHUNK_SIZE);
              for (const row of chunk) {
                const cells = Array.isArray(row) ? row : [];
                const payload = normalizedHeaders.map((_, index) => formatCell(cells[index] ?? null));
                await new Promise<void>((resolve, reject) => {
                  statement.run(payload, (err) => {
                    if (err) {
                      reject(err);
                      return;
                    }
                    resolve();
                  });
                });
              }
              if (chunk.length >= INSERT_CHUNK_SIZE) {
                await new Promise<void>((resolve) => setImmediate(resolve));
              }
            }
          } finally {
            finalize(statement);
          }

          totalRows += dataRows.length;
        }
      }

      await run(
        connection,
        'CREATE TABLE IF NOT EXISTS "_catalog" (table_name VARCHAR, columns VARCHAR, rows BIGINT)'
      );
      await run(connection, 'DELETE FROM "_catalog"');

      const catalogTables = await all<{ table_name: string }>(
        connection,
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_type = 'BASE TABLE' ORDER BY table_name"
      );

      const catalogEntries: { table_name: string; columns: string; rows: number }[] = [];

      for (const { table_name } of catalogTables) {
        if (table_name === "_catalog") {
          continue;
        }
        const columns = await all<{ column_name: string }>(
          connection,
          "SELECT column_name FROM information_schema.columns WHERE table_schema = 'main' AND table_name = ? ORDER BY ordinal_position",
          [table_name]
        );
        const columnList = columns.map((col) => col.column_name).join(", ");
        const [{ rows: rowCount }] =
          (await all<{ rows: number }>(connection, `SELECT COUNT(*) AS rows FROM "${table_name}"`)) ?? [{ rows: 0 }];

        await run(connection, 'INSERT INTO "_catalog" (table_name, columns, rows) VALUES (?, ?, ?)', [
          table_name,
          columnList,
          rowCount,
        ]);
        catalogEntries.push({ table_name, columns: columnList, rows: rowCount });
      }

      return NextResponse.json({ ok: true, tables: catalogEntries });
    } finally {
      connection.close();
    }
  } catch (error) {
    console.error("/api/ingest error", error);
    return NextResponse.json(
      {
        error: "Failed to ingest analytics data",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

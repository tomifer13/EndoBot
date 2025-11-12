// lib/pg.ts
import { Pool } from "pg";

const conn = process.env.PM_DATABASE_URL_RO;
if (!conn) {
  throw new Error("Missing env PM_DATABASE_URL_RO");
}

export const pool = new Pool({
  connectionString: conn,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

// Safety: force session read-only
pool.on("connect", (client) => {
  client
    .query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;")
    .catch(() => {});
});

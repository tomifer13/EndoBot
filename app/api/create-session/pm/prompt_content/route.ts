export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/pg";

export async function GET(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id") || 0);
  if (!id) return NextResponse.json({ id, content: "" });

  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ content: string }>(
      `
      SELECT content
      FROM prompt_versions
      WHERE prompt_id = $1 AND is_live = TRUE
      ORDER BY version_number DESC
      LIMIT 1
      `,
      [id]
    );
    return NextResponse.json(
      { id, content: rows[0]?.content ?? "" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("/api/pm/prompt_content error", e);
    return NextResponse.json({ id, content: "" }, { status: 500 });
  } finally {
    client.release();
  }
}

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { pool } from "@/lib/pg";

type CatRow = { id: number; name: string; parent_id: number | null };
type PromptRow = { id: number; title: string; category_id: number };

export async function GET() {
  const client = await pool.connect();
  try {
    const { rows: cats } = await client.query<CatRow>(
      "SELECT id, name, parent_id FROM categories"
    );

    const { rows: prompts } = await client.query<PromptRow>(`
      SELECT p.id, p.title, p.category_id
      FROM prompts p
      WHERE EXISTS (
        SELECT 1 FROM prompt_versions v
        WHERE v.prompt_id = p.id AND v.is_live = TRUE
      )
      ORDER BY p.title ASC
    `);

    const nodes = new Map<number, any>();
    cats.forEach((c) =>
      nodes.set(c.id, { id: c.id, name: c.name, children: [] as any[], prompts: [] as any[] })
    );

    const roots: any[] = [];
    cats.forEach((c) => {
      if (c.parent_id && nodes.has(c.parent_id)) {
        nodes.get(c.parent_id).children.push(nodes.get(c.id));
      } else {
        roots.push(nodes.get(c.id));
      }
    });

    prompts.forEach((p) => {
      const n = nodes.get(p.category_id);
      if (n) n.prompts.push({ id: p.id, title: p.title });
    });

    const sortNode = (n: any) => {
      n.children.sort((a: any, b: any) => a.name.localeCompare(b.name));
      n.prompts.sort((a: any, b: any) => a.title.localeCompare(b.title));
      n.children.forEach(sortNode);
    };
    roots.forEach(sortNode);

    return NextResponse.json({ roots }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("/api/pm/tree error", e);
    return NextResponse.json({ error: "failed_to_load_tree" }, { status: 500 });
  } finally {
    client.release();
  }
}

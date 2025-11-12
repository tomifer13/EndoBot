export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { pool } from "@/lib/pg";

type CatRow = { id: number; name: string; parent_id: number | null };
type PromptRow = { id: number; title: string; category_id: number };

type PromptSummary = { id: number; title: string };
type CategoryNode = {
  id: number;
  name: string;
  children: CategoryNode[];
  prompts: PromptSummary[];
};

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

    const nodes = new Map<number, CategoryNode>();
    cats.forEach((c) =>
      nodes.set(c.id, { id: c.id, name: c.name, children: [], prompts: [] })
    );

    const roots: CategoryNode[] = [];
    cats.forEach((c) => {
      const node = nodes.get(c.id);
      if (!node) return;

      const parentId = c.parent_id;
      if (parentId !== null) {
        const parent = nodes.get(parentId);
        if (parent) {
          parent.children.push(node);
          return;
        }
      }
      roots.push(node);
    });

    prompts.forEach((p) => {
      const node = nodes.get(p.category_id);
      if (node) node.prompts.push({ id: p.id, title: p.title });
    });

    const sortNode = (node: CategoryNode) => {
      node.children.sort((a, b) => a.name.localeCompare(b.name));
      node.prompts.sort((a, b) => a.title.localeCompare(b.title));
      node.children.forEach(sortNode);
    };
    roots.forEach(sortNode);

    return NextResponse.json(
      { roots },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("/api/pm/tree error", e);
    return NextResponse.json(
      { error: "failed_to_load_tree" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

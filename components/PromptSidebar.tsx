"use client";

import { useEffect, useMemo, useState } from "react";

type TreeNode = {
  id: number;
  name: string;
  prompts: { id: number; title: string }[];
  children: TreeNode[];
};

export default function PromptSidebar({
  onInsert,
  className,
}: {
  onInsert: (text: string) => Promise<void>;
  className?: string;
}) {
  const [data, setData] = useState<{ roots: TreeNode[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/pm/tree", { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setErr(String(e)));
  }, []);

  const lower = q.trim().toLowerCase();

  const roots = useMemo(() => {
    if (!data) return [];
    if (!lower) return data.roots;

    const filterNode = (node: TreeNode): TreeNode | null => {
      const prompts = node.prompts.filter((x) =>
        x.title.toLowerCase().includes(lower)
      );
      const children = node.children
        .map(filterNode)
        .filter((child): child is TreeNode => Boolean(child));
      if (
        prompts.length ||
        children.length ||
        node.name.toLowerCase().includes(lower)
      ) {
        return { ...node, prompts, children };
      }
      return null;
    };

    return data.roots
      .map(filterNode)
      .filter((node): node is TreeNode => Boolean(node));
  }, [data, lower]);

  const fetchContent = async (id: number) => {
    const r = await fetch(`/api/pm/prompt_content?id=${id}`, { cache: "no-store" });
    const j = (await r.json()) as { content: string };
    await onInsert(j.content ?? "");
  };

  if (err) {
    return <aside className={className}><div className="p-3 text-sm text-red-600">Fehler: {err}</div></aside>;
  }

  return (
    <aside className={`border-r border-gray-200 bg-white ${className ?? ""}`}>
      <div className="p-3">
        <input
          className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring"
          placeholder="Vorlagen durchsuchen…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="h-[calc(90vh-3rem)] overflow-y-auto px-2 pb-4">
        {!data ? (
          <div className="p-3 text-sm text-gray-500">Lade Vorlagen…</div>
        ) : roots.length === 0 ? (
          <div className="p-3 text-sm text-gray-500">Keine Treffer</div>
        ) : (
          roots.map((n) => <Node key={n.id} node={n} onChoose={fetchContent} />)
        )}
      </div>
    </aside>
  );
}

function Node({ node, onChoose }: { node: TreeNode; onChoose: (id: number) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <div className="flex cursor-pointer items-center gap-2 px-2 py-1 hover:bg-gray-50" onClick={() => setOpen((v) => !v)}>
        <span className="text-gray-500">{open ? "▾" : "▸"}</span>
        <span className="font-medium">{node.name}</span>
      </div>
      {open && (
        <div className="ml-5">
          {node.prompts.map((p) => (
            <button
              key={p.id}
              onClick={() => onChoose(p.id)}
              className="mb-0.5 block w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-rose-50 hover:text-rose-700"
              title={p.title}
            >
              📝 {p.title}
            </button>
          ))}
          {node.children.map((c) => (
            <Node key={c.id} node={c} onChoose={onChoose} />
          ))}
        </div>
      )}
    </div>
  );
}

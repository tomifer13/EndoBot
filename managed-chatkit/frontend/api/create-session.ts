import type { VercelRequest, VercelResponse } from "@vercel/node";

type CreateSessionBody = {
  workflow?: { id?: string; version?: string | number };
  user?: string;
};

function readEnvString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function coerceVersionToString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const apiKey = readEnvString(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY" });
      return;
    }

    const body = (req.body ?? {}) as CreateSessionBody;

    // workflow.id: prefer body, fallback to env
    const workflowId =
      readEnvString(body.workflow?.id) ||
      readEnvString(process.env.OPENAI_WORKFLOW_ID) ||
      readEnvString(process.env.VITE_CHATKIT_WORKFLOW_ID);

    if (!workflowId) {
      res.status(400).json({
        error:
          "Missing required field 'workflow.id'. Send it in POST body: { workflow: { id: 'wf_...' } }",
      });
      return;
    }

    // workflow.version MUST be a string for this endpoint (per your error)
    const workflowVersion =
      coerceVersionToString(body.workflow?.version) ||
      readEnvString(process.env.OPENAI_WORKFLOW_VERSION) ||
      readEnvString(process.env.VITE_CHATKIT_WORKFLOW_VERSION);

    // user: prefer body; if missing, generate a stable-ish one from request headers.
    // (Frontend SHOULD send it; this fallback is only to keep it working.)
    const user =
      readEnvString(body.user) ||
      readEnvString(req.headers["x-chatkit-user"]) ||
      `anon_${(req.headers["x-forwarded-for"] ?? "na")
        .toString()
        .split(",")[0]
        .trim()}_${Date.now()}`;

    const resp = await fetch("https://api.openai.com/v1/chatkit/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "chatkit_beta=v1",
      },
      body: JSON.stringify({
        user, // REQUIRED
        workflow: {
          id: workflowId, // REQUIRED
          ...(workflowVersion ? { version: workflowVersion } : {}),
        },
      }),
    });

    const text = await resp.text();
    res.status(resp.status).send(text);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
}

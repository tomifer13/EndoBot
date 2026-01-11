import type { VercelRequest, VercelResponse } from "@vercel/node";

type CreateSessionBody = {
  workflow?: { id?: string; version?: string }; // ✅ version deve ser string
  user?: string;
};

function readEnvString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const apiKey = readEnvString(process.env.OPENAI_API_KEY);

    const fallbackWorkflowId =
      readEnvString(process.env.OPENAI_WORKFLOW_ID) ||
      readEnvString(process.env.VITE_CHATKIT_WORKFLOW_ID);

    // ✅ manter como string (NÃO converter para Number)
    const fallbackWorkflowVersion =
      readEnvString(process.env.OPENAI_WORKFLOW_VERSION) ||
      readEnvString(process.env.VITE_CHATKIT_WORKFLOW_VERSION);

    if (!apiKey) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY" });
      return;
    }

    const body = (req.body ?? {}) as CreateSessionBody;

    // Workflow (prefer body, fallback to env)
    const workflowId = readEnvString(body.workflow?.id) ?? fallbackWorkflowId;

    // ✅ version como string
    const workflowVersion =
      readEnvString(body.workflow?.version) ?? fallbackWorkflowVersion;

    if (!workflowId) {
      res.status(400).json({
        error:
          "Missing required field 'workflow.id'. Send it in POST body: { workflow: { id: 'wf_...' } }",
      });
      return;
    }

    // User (prefer body, else generate a fallback)
    // ⚠️ ideal: o frontend enviar um user estável (ex: userId do seu sistema).
    const user =
      readEnvString(body.user) ??
      `anon_${Math.random().toString(36).slice(2)}_${Date.now()}`;

    const resp = await fetch("https://api.openai.com/v1/chatkit/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "chatkit_beta=v1",
      },
      body: JSON.stringify({
        user, // ✅ REQUIRED
        workflow: {
          id: workflowId, // ✅ REQUIRED
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

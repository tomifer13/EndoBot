import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const workflowId =
      process.env.OPENAI_WORKFLOW_ID || process.env.VITE_CHATKIT_WORKFLOW_ID;
    const workflowVersion =
      process.env.OPENAI_WORKFLOW_VERSION || process.env.VITE_CHATKIT_WORKFLOW_VERSION;

    if (!apiKey) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY" });
      return;
    }
    if (!workflowId) {
      res.status(500).json({ error: "Missing workflow id" });
      return;
    }

    const resp = await fetch("https://api.openai.com/v1/chatkit/sessions", {
      method: "POST",
      headers: {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
  "OpenAI-Beta": "chatkit_beta=v1",
},
      body: JSON.stringify({
        workflow_id: workflowId,
        workflow_version: workflowVersion ? Number(workflowVersion) : undefined,
      }),
    });

    const text = await resp.text();
    res.status(resp.status).send(text);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
}

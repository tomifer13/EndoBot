const readEnvString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export const workflowId = (() => {
  const id = readEnvString(import.meta.env.VITE_CHATKIT_WORKFLOW_ID);
  if (!id || id.startsWith("wf_replace")) {
    throw new Error("Set VITE_CHATKIT_WORKFLOW_ID in your .env file.");
  }
  return id;
})();

const workflowVersion = readEnvString(import.meta.env.VITE_CHATKIT_WORKFLOW_VERSION);

function getOrCreateUserId(): string {
  const key = "chatkit_user_id";
  const existing = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  if (existing && existing.trim()) return existing;

  const created = `user_${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`
  if (typeof window !== "undefined") window.localStorage.setItem(key, created);
  return created;
}

export function createClientSecretFetcher(
  workflow: string,
  endpoint = "/api/create-session"
) {
  return async (currentSecret: string | null) => {
    if (currentSecret) return currentSecret;

    const user = getOrCreateUserId();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user,
        workflow: {
          id: workflow,
          ...(workflowVersion ? { version: workflowVersion } : {}),
        },
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      client_secret?: string;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to create session");
    }

    if (!payload.client_secret) {
      throw new Error("Missing client secret in response");
    }

    return payload.client_secret;
  };
}

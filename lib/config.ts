import { ColorScheme, StartScreenPrompt, ThemeOption } from "@openai/chatkit";

const rawWorkflowId = process.env.NEXT_PUBLIC_CHATKIT_WORKFLOW_ID?.trim() ?? "";

export const WORKFLOW_ID = rawWorkflowId;

export type ChatAgentOption = {
  id: string;
  label: string;
  workflowId: string;
  description?: string;
};

const sanitizeEnvValue = (value: string): string =>
  value.trim().replace(/^['"]|['"]$/g, "");

const buildAgentId = (value: string, fallbackIndex: number): string => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  return slug || `agent-${fallbackIndex + 1}`;
};

const parseAgentOptionsFromEnv = (): ChatAgentOption[] => {
  const rawValue = process.env.NEXT_PUBLIC_CHATKIT_AGENTS;
  if (!rawValue) {
    return [];
  }

  const sanitized = sanitizeEnvValue(rawValue);
  if (!sanitized) {
    return [];
  }

  try {
    const parsed = JSON.parse(sanitized) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry, index) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }
          const record = entry as Record<string, unknown>;
          const workflowId =
            typeof record.workflowId === "string"
              ? record.workflowId.trim()
              : "";
          if (!workflowId) {
            return null;
          }
          const label =
            typeof record.label === "string" && record.label.trim()
              ? record.label.trim()
              : `Agent ${index + 1}`;
          const id =
            typeof record.id === "string" && record.id.trim()
              ? record.id.trim()
              : buildAgentId(label, index);
          const description =
            typeof record.description === "string" &&
            record.description.trim()
              ? record.description.trim()
              : undefined;
          return {
            id,
            label,
            workflowId,
            description,
          };
        })
        .filter((option): option is ChatAgentOption => Boolean(option));
    }
  } catch {
    // Ignore JSON parsing errors and fall back to the pipe-delimited format.
  }

  const entries = sanitized
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  return entries
    .map((entry, index) => {
      const [labelPart, workflowIdPart, descriptionPart] = entry
        .split("|")
        .map((part) => part.trim());
      if (!workflowIdPart) {
        return null;
      }
      const label = labelPart || `Agent ${index + 1}`;
      return {
        id: buildAgentId(label, index),
        label,
        workflowId: workflowIdPart,
        description: descriptionPart || undefined,
      };
    })
    .filter((option): option is ChatAgentOption => Boolean(option));
};

const envAgentOptions = parseAgentOptionsFromEnv();

const fallbackAgent: ChatAgentOption | null = rawWorkflowId
  ? {
      id: "default",
      label: "Default assistant",
      workflowId: rawWorkflowId,
    }
  : null;

export const CHAT_AGENT_OPTIONS = envAgentOptions.length
  ? envAgentOptions
  : fallbackAgent
  ? [fallbackAgent]
  : [];

export const DEFAULT_AGENT = CHAT_AGENT_OPTIONS[0] ?? null;
export const DEFAULT_WORKFLOW_ID = DEFAULT_AGENT?.workflowId ?? "";

export const CREATE_SESSION_ENDPOINT = "/api/create-session";

export const STARTER_PROMPTS: StartScreenPrompt[] = [
  {
    label: "What can you do?",
    prompt: "What can you do?",
    icon: "circle-question",
  },
];

export const PLACEHOLDER_INPUT = "Ask anything...";

export const GREETING = "How can I help you today?";

export const getThemeConfig = (theme: ColorScheme): ThemeOption => ({
  color: {
    grayscale: {
      hue: 220,
      tint: 6,
      shade: theme === "dark" ? -1 : -4,
    },
    accent: {
      primary: theme === "dark" ? "#f1f5f9" : "#0f172a",
      level: 1,
    },
  },
  radius: "round",
  // Add other theme options here
  // chatkit.studio/playground to explore config options
});

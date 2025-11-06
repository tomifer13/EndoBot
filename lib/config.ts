import { ColorScheme, StartScreenPrompt, ThemeOption } from "@openai/chatkit";

export const WORKFLOW_ID =
  process.env.NEXT_PUBLIC_CHATKIT_WORKFLOW_ID?.trim() ?? "";

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

export const getThemeConfig = (_theme: ColorScheme): ThemeOption => ({
  color: {
    grayscale: {
      hue: 0,
      tint: 8,
      shade: -6,
    },
    accent: {
      primary: "#bb0a30",
      level: 2,
    },
  },
  radius: "round",
  // Add other theme options here
  // chatkit.studio/playground to explore config options
});

import { ColorScheme, StartScreenPrompt, ThemeOption } from "@openai/chatkit";

export const WORKFLOW_ID =
  process.env.NEXT_PUBLIC_CHATKIT_WORKFLOW_ID?.trim() ?? "";

export const CREATE_SESSION_ENDPOINT = "/api/create-session";

export const STARTER_PROMPTS: StartScreenPrompt[] = [
  {
    label: "Was kannst du tun?",
    prompt: "Was kannst du tun?",
    icon: "circle-question",
  },
];

export const PLACEHOLDER_INPUT = "schlaue Rechtsfrage...";

export const GREETING = "Wie kann ich Ihnen helfen, liebe RuP-Mitarbeitenden?";

export const getThemeConfig = (_theme: ColorScheme): ThemeOption => ({
  color: {
    grayscale: {
      hue: 0,
      tint: 8,
      shade: -4,
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

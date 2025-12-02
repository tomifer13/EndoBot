import {
  type ColorScheme,
  type ComposerOption,
  type FontObject,
  type ModelOption,
  type StartScreenOption,
  type StartScreenPrompt,
  type ThemeOption,
  type ToolOption,
} from "@openai/chatkit";

export const WORKFLOW_ID =
  process.env.NEXT_PUBLIC_CHATKIT_WORKFLOW_ID?.trim() ?? "";

export const CREATE_SESSION_ENDPOINT = "/api/create-session";

export const GREETING = "Hello Shooter ? How Can i help ?";

const STARTER_PROMPTS: StartScreenPrompt[] = [
  {
    icon: "bolt",
    label: "Log today's work and reflections now",
    prompt:
      "Hey, I want to log my activity from today's training session, capture how it felt, and flag any issues for my coach.",
  },
  {
    icon: "sparkle",
    label: "Shot grouping recap with detailed insights",
    prompt:
      "Hey, how was my shot grouping for the last 10 sessions, and can you highlight the trends that stand out?",
  },
  {
    icon: "lightbulb",
    label: "Recent wins and training highlights",
    prompt:
      "Hey, what worked for me in the past few days and which drills or cues led to the best results?",
  },
  {
    icon: "book-open",
    label: "Shooting timeline and consistency tracker",
    prompt:
      "When did I shoot recently, how consistent have I been, and where are the gaps I should close?",
  },
  {
    icon: "globe",
    label: "Coach plan milestones and accountability",
    prompt:
      "What was the training plan my coach gave me, and can you map out the milestones I still need to hit?",
  },
  {
    icon: "confetti",
    label: "Sync My Shots tips for competition prep",
    prompt:
      "Hey, what should I try next in Sync My Shots to improve, especially if I'm prepping for competition?",
  },
];

export const START_SCREEN: StartScreenOption = {
  greeting: GREETING,
  prompts: STARTER_PROMPTS,
};

const INTER_FONT_SOURCES: FontObject[] = [
  {
    family: "Inter",
    src: "https://rsms.me/inter/font-files/Inter-Regular.woff2",
    weight: 400,
    style: "normal",
  },
  {
    family: "Inter",
    src: "https://rsms.me/inter/font-files/Inter-Italic.woff2",
    weight: 400,
    style: "italic",
  },
  {
    family: "Inter",
    src: "https://rsms.me/inter/font-files/Inter-Medium.woff2",
    weight: 500,
    style: "normal",
  },
  {
    family: "Inter",
    src: "https://rsms.me/inter/font-files/Inter-SemiBold.woff2",
    weight: 600,
    style: "normal",
  },
];

const COMPOSER_TOOLS: ToolOption[] = [
  {
    id: "search_docs",
    label: "Search docs",
    shortLabel: "Docs",
    placeholderOverride: "Search documentation",
    icon: "book-open",
    pinned: false,
  }
];

const COMPOSER_MODELS: ModelOption[] = [
  {
    id: "crisp",
    label: "Crisp",
    description: "Concise and factual",
    default: true,
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Friendly tone with grounded detail",
  },
  {
    id: "deep_dive",
    label: "Deep dive",
    description: "Long-form reasoning for research-style answers",
  },
];

export const COMPOSER_CONFIG: ComposerOption = {
  placeholder: "Tell me or ask me anything ?",
  attachments: {
    enabled: true,
    maxCount: 5,
    maxSize: 10_485_760,
  },
  tools: COMPOSER_TOOLS,
  models: COMPOSER_MODELS,
};

export const getThemeConfig = (scheme: ColorScheme): ThemeOption => ({
  colorScheme: scheme,
  radius: "soft",
  density: "spacious",
  color: {
    grayscale: {
      hue: 229,
      tint: 9,
      shade: scheme === "dark" ? -1 : -4,
    },
    accent: {
      primary: "#b8bcff",
      level: 1,
    },
  },
  typography: {
    baseSize: 16,
    fontFamily: "Inter, sans-serif",
    fontSources: INTER_FONT_SOURCES,
  },
});

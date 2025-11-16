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

// Time-based WESCU greeting
const getGreeting = (): string => {
  const hour = new Date().getHours();
  let timeGreeting = "Hello";
  
  if (hour >= 5 && hour < 12) {
    timeGreeting = "Good Morning";
  } else if (hour >= 12 && hour < 17) {
    timeGreeting = "Good Afternoon";
  } else if (hour >= 17 && hour < 21) {
    timeGreeting = "Good Evening";
  } else {
    timeGreeting = "Good Night";
  }
  
  return `${timeGreeting}, welcome to the official website of WESCU. Here, a world of possibilities awaits you. We are committed to ensuring that your life is enriched with holistic prosperity, hope, and purpose. Whether you're exploring financial solutions, seeking guidance, or simply learning more about our services, know that you are valued and supported every step of the way. Welcome to WESCU—where your journey toward sustainable success begins. How may I help you today?`;
};

export const GREETING = getGreeting();

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

"use client";

import { useCallback } from "react";
import { ChatKitPanel, type FactAction } from "@/components/ChatKitPanel";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function App() {
  const { scheme, setScheme } = useColorScheme();
  const isDark = scheme === "dark";

  const handleWidgetAction = useCallback(async (action: FactAction) => {
    if (process.env.NODE_ENV !== "production") {
      console.info("[ChatKitPanel] widget action", action);
    }
  }, []);

  const handleResponseEnd = useCallback(() => {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[ChatKitPanel] response end");
    }
  }, []);

  const handleToggleTheme = useCallback(() => {
    setScheme(isDark ? "light" : "dark");
  }, [isDark, setScheme]);

  return (
    <main className="min-h-[calc(100vh-60px)] bg-[--color-background] text-[--color-foreground] flex flex-col">
      <header
        className={`h-[60px] max-h-[60px] min-h-[60px] flex items-center justify-between px-6 shadow-lg backdrop-blur ${
          isDark
            ? "bg-zinc-900/80 border-b border-white/10 text-white"
            : "bg-white/80 border-b border-black/5 text-gray-900"
        }`}
      >
        <div className="flex flex-col leading-none">
          <span className="text-lg sm:text-xl font-semibold tracking-[0.4em] uppercase title-glow">
            Sync my shots
          </span>
          <span className="text-[11px] sm:text-xs uppercase tracking-[0.4em] tagline-shimmer whitespace-nowrap">
            A SRINITHI ABIRAMI INITIATIVE
          </span>
        </div>
        <button
          type="button"
          onClick={handleToggleTheme}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            isDark
              ? "bg-white/10 text-white hover:bg-white/20 border border-white/20"
              : "bg-gray-900 text-white hover:bg-gray-800 border border-transparent"
          }`}
        >
          {isDark ? "Light mode" : "Dark mode"}
        </button>
      </header>
      <div className="flex-1 overflow-auto px-4 py-8 sm:px-6">
        <ChatKitPanel
          theme={scheme}
          onWidgetAction={handleWidgetAction}
          onResponseEnd={handleResponseEnd}
          onThemeRequest={setScheme}
        />
      </div>
    </main>
  );
}

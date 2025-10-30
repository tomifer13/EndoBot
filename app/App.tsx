"use client";

import { useCallback, useState, type ChangeEvent } from "react";
import { ChatKitPanel, type FactAction } from "@/components/ChatKitPanel";
import { useColorScheme } from "@/hooks/useColorScheme";
import { CHAT_AGENT_OPTIONS, DEFAULT_AGENT } from "@/lib/config";

export default function App() {
  const { scheme, setScheme } = useColorScheme();
  const defaultAgentId =
    DEFAULT_AGENT?.id ?? (CHAT_AGENT_OPTIONS[0]?.id ?? "");
  const [selectedAgentId, setSelectedAgentId] = useState(defaultAgentId);

  const selectedAgent =
    CHAT_AGENT_OPTIONS.find((agent) => agent.id === selectedAgentId) ??
    CHAT_AGENT_OPTIONS[0] ??
    null;
  const hasAgents = CHAT_AGENT_OPTIONS.length > 0;

  const handleAgentChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      setSelectedAgentId(event.target.value);
    },
    []
  );

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

  return (
    <main className="flex min-h-screen flex-col items-center justify-end bg-slate-100 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Choose an assistant
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Select which workflow should power this chat session.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="assistant-selector"
              className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-300"
            >
              Assistant
            </label>
            <select
              id="assistant-selector"
              value={selectedAgent?.id ?? ""}
              onChange={handleAgentChange}
              disabled={!hasAgents}
              className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-700"
            >
              {!hasAgents && <option value="">No assistants configured</option>}
              {CHAT_AGENT_OPTIONS.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.label}
                </option>
              ))}
            </select>
            {selectedAgent?.description ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {selectedAgent.description}
              </p>
            ) : null}
          </div>
        </div>

        {selectedAgent ? (
          <ChatKitPanel
            workflowId={selectedAgent.workflowId}
            theme={scheme}
            onWidgetAction={handleWidgetAction}
            onResponseEnd={handleResponseEnd}
            onThemeRequest={setScheme}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            Add at least one ChatKit workflow by setting
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs font-semibold text-slate-900 dark:bg-slate-800 dark:text-slate-100">
              NEXT_PUBLIC_CHATKIT_WORKFLOW_ID
            </code>
            or
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs font-semibold text-slate-900 dark:bg-slate-800 dark:text-slate-100">
              NEXT_PUBLIC_CHATKIT_AGENTS
            </code>
            in your <code>.env.local</code> file.
          </div>
        )}
      </div>
    </main>
  );
}

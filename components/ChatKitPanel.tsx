"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";
import {
  STARTER_PROMPTS,
  PLACEHOLDER_INPUT,
  GREETING,
  CREATE_SESSION_ENDPOINT,
  WORKFLOW_ID,
  getThemeConfig,
} from "@/lib/config";
import { ErrorOverlay } from "./ErrorOverlay";
import PromptSidebar from "./PromptSidebar";
import TokenUsagePanel, {
  type AggregatedModelUsage,
  type TokenUsageSummary,
} from "./TokenUsagePanel";
import type { ColorScheme } from "@/hooks/useColorScheme";

export type FactAction = {
  type: "save";
  factId: string;
  factText: string;
};

export type ResponseUsage = {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

type ChatKitPanelProps = {
  theme: ColorScheme;
  onWidgetAction: (action: FactAction) => Promise<void>;
  onResponseEnd: (sessionId?: string, usage?: ResponseUsage, threadId?: string | null) => void;
  onThemeRequest: (scheme: ColorScheme) => void;
  onInsertPrompt?: (text: string) => Promise<void>;
};

type ErrorState = {
  script: string | null;
  session: string | null;
  integration: string | null;
  retryable: boolean;
};

type WidgetAction = {
  type: string;
  values?: Record<string, unknown>;
  payload?: Record<string, unknown>;
};

type SidebarMode = "none" | "prompts" | "tokens";

type ChatKitLogEvent = {
  name?: string;
  data?: Record<string, unknown>;
};

type UsageEvent = ResponseUsage & { responseId?: string | null };
type ResponseEndDetail = {
  usage?: Record<string, unknown>;
  model?: string;
  response?: Record<string, unknown>;
};

const isBrowser = typeof window !== "undefined";
const isDev = process.env.NODE_ENV !== "production";
const THREADLESS_ID = "default";

const createInitialErrors = (): ErrorState => ({
  script: null,
  session: null,
  integration: null,
  retryable: false,
});

export function ChatKitPanel({
  theme,
  onWidgetAction,
  onResponseEnd,
  onThemeRequest,
  onInsertPrompt,
}: ChatKitPanelProps) {
  const processedFacts = useRef(new Set<string>());
  const [errors, setErrors] = useState<ErrorState>(() => createInitialErrors());
  const [isInitializingSession, setIsInitializingSession] = useState(true);
  const isMountedRef = useRef(true);
  const [scriptStatus, setScriptStatus] = useState<"pending" | "ready" | "error">(
    () => (isBrowser && window.customElements?.get("openai-chatkit") ? "ready" : "pending")
  );
  const [widgetInstanceKey, setWidgetInstanceKey] = useState(0);
  const sessionIdRef = useRef<string | null>(null);
  const responseCountRef = useRef(0);
  const pendingUsageQueueRef = useRef<UsageEvent[]>([]);
  const processedResponseIdsRef = useRef(new Set<string>());
  const currentThreadIdRef = useRef<string>(THREADLESS_ID);
  const threadUsageRef = useRef<Record<string, Record<string, AggregatedModelUsage>>>({
    [THREADLESS_ID]: {},
  });
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("prompts");
  const [usageByModel, setUsageByModel] = useState<Record<string, AggregatedModelUsage>>(
    {}
  );

  const setErrorState = useCallback((updates: Partial<ErrorState>) => {
    setErrors((current) => ({ ...current, ...updates }));
  }, []);

  const clearUsageTracking = useCallback(() => {
    pendingUsageQueueRef.current = [];
    processedResponseIdsRef.current.clear();
    threadUsageRef.current = { [THREADLESS_ID]: {} };
    currentThreadIdRef.current = THREADLESS_ID;
    setUsageByModel({});
  }, []);

  const handleUsageLog = useCallback((entry?: ChatKitLogEvent) => {
    const usageEvent = extractUsageEvent(entry);
    if (!usageEvent) return;
    if (
      usageEvent.responseId &&
      processedResponseIdsRef.current.has(usageEvent.responseId)
    ) {
      return;
    }
    if (usageEvent.responseId) {
      processedResponseIdsRef.current.add(usageEvent.responseId);
    }
    pendingUsageQueueRef.current = [...pendingUsageQueueRef.current, usageEvent];
  }, []);

  const applyUsageToState = useCallback((usage: ResponseUsage) => {
    setUsageByModel((prev) => {
      const current = prev[usage.model] ?? {
        model: usage.model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };
      const updated = {
        model: usage.model,
        promptTokens: current.promptTokens + usage.promptTokens,
        completionTokens: current.completionTokens + usage.completionTokens,
        totalTokens: current.totalTokens + usage.totalTokens,
      };
      const next = { ...prev, [usage.model]: updated };
      threadUsageRef.current[currentThreadIdRef.current] = next;
      return next;
    });
  }, []);

  const switchToThread = useCallback((threadId: string | null) => {
    const nextId = threadId ?? THREADLESS_ID;
    currentThreadIdRef.current = nextId;
    const saved = threadUsageRef.current[nextId];
    if (saved) {
      const clone = { ...saved };
      threadUsageRef.current[nextId] = clone;
      setUsageByModel(clone);
    } else {
      threadUsageRef.current[nextId] = {};
      setUsageByModel({});
    }
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isBrowser) return;

    let timeoutId: number | undefined;

    const handleLoaded = () => {
      if (!isMountedRef.current) return;
      setScriptStatus("ready");
      setErrorState({ script: null });
    };

    const handleError = (event: Event) => {
      console.error("Failed to load chatkit.js for some reason", event);
      if (!isMountedRef.current) return;
      setScriptStatus("error");
      const detail = (event as CustomEvent<unknown>)?.detail ?? "unknown error";
      setErrorState({ script: `Error: ${String(detail)}`, retryable: false });
      setIsInitializingSession(false);
    };

    window.addEventListener("chatkit-script-loaded", handleLoaded);
    window.addEventListener("chatkit-script-error", handleError as EventListener);

    if (window.customElements?.get("openai-chatkit")) {
      handleLoaded();
    } else if (scriptStatus === "pending") {
      timeoutId = window.setTimeout(() => {
        if (!window.customElements?.get("openai-chatkit")) {
          handleError(
            new CustomEvent("chatkit-script-error", {
              detail:
                "ChatKit web component is unavailable. Verify that the script URL is reachable.",
            })
          );
        }
      }, 5000);
    }

    return () => {
      window.removeEventListener("chatkit-script-loaded", handleLoaded);
      window.removeEventListener("chatkit-script-error", handleError as EventListener);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [scriptStatus, setErrorState]);

  const isWorkflowConfigured = Boolean(
    WORKFLOW_ID && !WORKFLOW_ID.startsWith("wf_replace")
  );

  useEffect(() => {
    if (!isWorkflowConfigured && isMountedRef.current) {
      setErrorState({
        session: "Set NEXT_PUBLIC_CHATKIT_WORKFLOW_ID in your .env.local file.",
        retryable: false,
      });
      setIsInitializingSession(false);
    }
  }, [isWorkflowConfigured, setErrorState]);

  const handleResetChat = useCallback(() => {
    processedFacts.current.clear();
    clearUsageTracking();
    if (isBrowser) {
      setScriptStatus(
        window.customElements?.get("openai-chatkit") ? "ready" : "pending"
      );
    }
    setIsInitializingSession(true);
    setErrors(createInitialErrors());
    setWidgetInstanceKey((prev) => prev + 1);
  }, [clearUsageTracking]);

  const getClientSecret = useCallback(
    async (currentSecret: string | null) => {
      if (isDev) {
        console.info("[ChatKitPanel] getClientSecret invoked", {
          currentSecretPresent: Boolean(currentSecret),
          workflowId: WORKFLOW_ID,
          endpoint: CREATE_SESSION_ENDPOINT,
        });
      }

      if (!isWorkflowConfigured) {
        const detail = "Set NEXT_PUBLIC_CHATKIT_WORKFLOW_ID in your .env.local file.";
        if (isMountedRef.current) {
          setErrorState({ session: detail, retryable: false });
          setIsInitializingSession(false);
        }
        throw new Error(detail);
      }

      if (isMountedRef.current) {
        if (!currentSecret) setIsInitializingSession(true);
        setErrorState({ session: null, integration: null, retryable: false });
      }

      try {
        const response = await fetch(CREATE_SESSION_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workflow: { id: WORKFLOW_ID },
            chatkit_configuration: {
              // enable attachments
              file_upload: { enabled: true },
            },
          }),
        });

        const raw = await response.text();

        if (isDev) {
          console.info("[ChatKitPanel] createSession response", {
            status: response.status,
            ok: response.ok,
            bodyPreview: raw.slice(0, 1600),
          });
        }

        let data: Record<string, unknown> = {};
        if (raw) {
          try {
            data = JSON.parse(raw) as Record<string, unknown>;
          } catch (parseError) {
            console.error("Failed to parse create-session response", parseError);
          }
        }

        if (!response.ok) {
          const detail = extractErrorDetail(data, response.statusText);
          console.error("Create session request failed", {
            status: response.status,
            body: data,
          });
          throw new Error(detail);
        }

        const clientSecret = data?.client_secret as string | undefined;
        if (!clientSecret) {
          throw new Error("Missing client secret in response");
        }

        // Capture session_id for tracking
        const sessionId = data?.session_id as string | undefined;
        if (sessionId) {
          sessionIdRef.current = sessionId;
        }

        if (isMountedRef.current) {
          setErrorState({ session: null, integration: null });
        }

        return clientSecret;
      } catch (error) {
        console.error("Failed to create ChatKit session", error);
        const detail =
          error instanceof Error
            ? error.message
            : "Unable to start ChatKit session.";
        if (isMountedRef.current) {
          setErrorState({ session: detail, retryable: false });
        }
        throw error instanceof Error ? error : new Error(detail);
      } finally {
        if (isMountedRef.current && !currentSecret) {
          setIsInitializingSession(false);
        }
      }
    },
    [isWorkflowConfigured, setErrorState]
  );

  const { control, setComposerValue, focusComposer } = useChatKit({
    locale: "de-DE",
    api: { getClientSecret },
    theme: { colorScheme: theme, ...getThemeConfig(theme) },
    startScreen: { greeting: GREETING, prompts: STARTER_PROMPTS },
    composer: {
      placeholder: PLACEHOLDER_INPUT,
      attachments: { enabled: true },
    },
    // Handle widget button "In Eingabefeld übernehmen"
    widgets: {
      onAction: async (action: WidgetAction) => {
        if (action.type === "prompt.insert") {
          const text =
            typeof action.values?.prompt_text === "string"
              ? action.values.prompt_text
              : "";
          const trimmed = text.trim();
          if (trimmed) {
            if (onInsertPrompt) {
              await onInsertPrompt(trimmed);
            }
            await setComposerValue({ text: "" });
            await setComposerValue({ text: trimmed });
            await focusComposer();
          }
        }
      },
    },
    threadItemActions: { feedback: false },
    onClientTool: async (invocation: {
      name: string;
      params: Record<string, unknown>;
    }) => {
      if (invocation.name === "switch_theme") {
        const requested = invocation.params.theme;
        if (requested === "light") {
          if (isDev) console.debug("[ChatKitPanel] switch_theme", requested);
          onThemeRequest(requested as ColorScheme);
          return { success: true };
        }
        return { success: false };
      }

      if (invocation.name === "record_fact") {
        const id = String(invocation.params.fact_id ?? "");
        const text = String(invocation.params.fact_text ?? "");
        if (!id || processedFacts.current.has(id)) return { success: true };
        processedFacts.current.add(id);
        void onWidgetAction({
          type: "save",
          factId: id,
          factText: text.replace(/\s+/g, " ").trim(),
        });
        return { success: true };
      }

      return { success: false };
    },
    onResponseEnd: (event: unknown) => {
      const detail = event as ResponseEndDetail | undefined;
      responseCountRef.current += 1;
      let usagePayload = extractUsageFromResponse(detail);
      const usageFromDetail = Boolean(usagePayload);
      if (!usagePayload && pendingUsageQueueRef.current.length > 0) {
        const [latestUsage, ...rest] = pendingUsageQueueRef.current;
        pendingUsageQueueRef.current = rest;
        usagePayload = latestUsage
          ? {
              model: latestUsage.model,
              promptTokens: latestUsage.promptTokens,
              completionTokens: latestUsage.completionTokens,
              totalTokens: latestUsage.totalTokens,
            }
          : undefined;
      }
      if (usagePayload) {
        applyUsageToState(usagePayload);
        if (usageFromDetail) {
          pendingUsageQueueRef.current = [];
          processedResponseIdsRef.current.clear();
        }
      }
      onResponseEnd(
        sessionIdRef.current ?? undefined,
        usagePayload,
        currentThreadIdRef.current === THREADLESS_ID
          ? null
          : currentThreadIdRef.current
      );
    },
    onResponseStart: () => {
      setErrorState({ integration: null, retryable: false });
    },
    onThreadChange: ({ threadId }: { threadId: string | null }) => {
      processedFacts.current.clear();
      pendingUsageQueueRef.current = [];
      processedResponseIdsRef.current.clear();
      switchToThread(threadId);
    },
    onError: ({ error }: { error: unknown }) => {
      console.error("ChatKit error", error);
    },
    onLog: (entry?: ChatKitLogEvent) => {
      handleUsageLog(entry);
    },
  });

  const handleInsertPrompt = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      await setComposerValue({ text: "" });
      await setComposerValue({ text: trimmed });
      await focusComposer();
      if (onInsertPrompt) {
        await onInsertPrompt(trimmed);
      }
    },
    [focusComposer, onInsertPrompt, setComposerValue]
  );

  const usageSummary = useMemo<TokenUsageSummary>(() => {
    const models = Object.values(usageByModel).sort(
      (a, b) => b.totalTokens - a.totalTokens
    );
    const totalTokens = models.reduce((sum, entry) => sum + entry.totalTokens, 0);
    return { models, totalTokens };
  }, [usageByModel]);

  const activeError = errors.session ?? errors.integration;
  const blockingError = errors.script ?? activeError;

  if (isDev) {
    console.debug("[ChatKitPanel] render state", {
      isInitializingSession,
      hasControl: Boolean(control),
      scriptStatus,
      hasError: Boolean(blockingError),
      workflowId: WORKFLOW_ID,
    });
  }

  return (
    <div className="flex h-[90vh] w-full gap-4">
      <div className="hidden lg:flex flex-col w-72 shrink-0">
        <div className="flex flex-row items-center justify-end mb-3 gap-2">
          {/* Prompt-Manager Toggle */}
          <button
            type="button"
            onClick={() =>
              setSidebarMode(
                sidebarMode === "prompts" ? "none" : "prompts"
              )
            }
            className={`w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 transition-colors 
              ${sidebarMode === "prompts"
                ? "ring-2 ring-[#bb0a30] bg-gray-200"
                : "hover:bg-gray-200"}
            `}
            aria-label="Prompt-Manager"
          >
            <svg
              className={`w-5 h-5 ${sidebarMode === "prompts" ? "text-[#bb0a30]" : "text-[#bb0a30]/80"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                d="M17 19H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2zm0 0V6a2 2 0 0 1 2-2h.001A2 2 0 0 1 21 6v11a2 2 0 0 1-2 2z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {/* Token-Usage Toggle */}
          <button
            type="button"
            onClick={() =>
              setSidebarMode(
                sidebarMode === "tokens" ? "none" : "tokens"
              )
            }
            className={`w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 transition-colors 
              ${sidebarMode === "tokens"
                ? "ring-2 ring-[#bb0a30] bg-gray-200"
                : "hover:bg-gray-200"}
            `}
            aria-label="Token-Nutzung"
          >
            <svg
              className={`w-5 h-5 ${sidebarMode === "tokens" ? "text-[#bb0a30]" : "text-[#bb0a30]/80"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                d="M21 12A9 9 0 1 1 12 3v9z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        {sidebarMode === "prompts" && (
          <div className="flex-1 overflow-hidden rounded-2xl bg-white shadow">
            <PromptSidebar onInsert={handleInsertPrompt} className="h-full" />
          </div>
        )}
        {sidebarMode === "tokens" && (
          <div className="flex-1 overflow-hidden rounded-2xl bg-white shadow">
            <TokenUsagePanel summary={usageSummary} />
          </div>
        )}
        {sidebarMode !== "prompts" && sidebarMode !== "tokens" && (
          <div className="flex-1 flex items-center justify-center text-gray-300 text-sm bg-transparent">
          </div>
        )}
      </div>

      <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl bg-white pb-8 shadow-xl transition-colors">
        <ChatKit
          key={widgetInstanceKey}
          control={control}
          className={
            blockingError || isInitializingSession
              ? "pointer-events-none opacity-0"
              : "block h-full w-full"
          }
        />
        <ErrorOverlay
          error={blockingError}
          fallbackMessage={
            blockingError || !isInitializingSession
              ? null
              : "Loading assistant session..."
          }
          onRetry={blockingError && errors.retryable ? handleResetChat : null}
          retryLabel="Restart chat"
        />
      </div>
    </div>
  );
}

function extractErrorDetail(
  payload: Record<string, unknown> | undefined,
  fallback: string
): string {
  if (!payload) return fallback;

  const error = payload.error;
  if (typeof error === "string") return error;

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  const details = payload.details;
  if (typeof details === "string") return details;

  if (details && typeof details === "object" && "error" in details) {
    const nestedError = (details as { error?: unknown }).error;
    if (typeof nestedError === "string") return nestedError;
    if (
      nestedError &&
      typeof nestedError === "object" &&
      "message" in nestedError &&
      typeof (nestedError as { message?: unknown }).message === "string"
    ) {
      return (nestedError as { message: string }).message;
    }
  }

  if (typeof payload.message === "string") return payload.message;

  return fallback;
}

function extractUsageFromResponse(detail?: ResponseEndDetail): ResponseUsage | undefined {
  if (!detail) return undefined;
  const usageSource =
    (isRecord(detail.usage) && detail.usage) ||
    (isRecord(detail.response) && isRecord(detail.response.usage)
      ? detail.response.usage
      : undefined);
  if (!usageSource) return undefined;

  const model =
    (typeof detail.model === "string" && detail.model) ||
    (isRecord(detail.response) && typeof detail.response.model === "string"
      ? detail.response.model
      : undefined) ||
    "unbekanntes-Modell";

  const promptTokens = readNumber(
    usageSource,
    "prompt_tokens",
    "input_tokens",
    "input_token_count"
  );
  const completionTokens = readNumber(
    usageSource,
    "completion_tokens",
    "output_tokens",
    "output_token_count"
  );
  const totalTokens =
    readNumber(usageSource, "total_tokens", "token_count") ||
    promptTokens + completionTokens;

  if (!totalTokens) return undefined;

  return {
    model,
    promptTokens: promptTokens || Math.max(totalTokens - completionTokens, 0),
    completionTokens:
      completionTokens || Math.max(totalTokens - promptTokens, 0),
    totalTokens,
  };
}

function extractUsageEvent(entry?: ChatKitLogEvent): UsageEvent | null {
  if (!entry) return null;
  const payload = isRecord(entry.data) ? entry.data : {};
  const response = resolveResponsePayload(payload);
  const usageSource = resolveUsageSource(payload, response);
  if (!usageSource) return null;

  const promptTokens = readNumber(
    usageSource,
    "prompt_tokens",
    "input_tokens",
    "input_token_count"
  );
  const completionTokens = readNumber(
    usageSource,
    "completion_tokens",
    "output_tokens",
    "output_token_count"
  );
  const totalTokens =
    readNumber(usageSource, "total_tokens", "token_count") ||
    promptTokens + completionTokens;

  if (!totalTokens) return null;

  const model = resolveModelName(payload, response);
  const responseId =
    typeof payload.response_id === "string"
      ? payload.response_id
      : typeof response?.id === "string"
        ? (response.id as string)
        : undefined;

  return {
    model,
    promptTokens: promptTokens || Math.max(totalTokens - completionTokens, 0),
    completionTokens:
      completionTokens || Math.max(totalTokens - promptTokens, 0),
    totalTokens,
    responseId,
  };
}

function resolveResponsePayload(
  payload: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (isRecord(payload.response)) return payload.response;
  if (isRecord(payload.last_response)) return payload.last_response;
  return undefined;
}

function resolveUsageSource(
  payload: Record<string, unknown>,
  response?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (isRecord(payload.usage)) return payload.usage;
  if (response && isRecord(response.usage)) return response.usage;
  return undefined;
}

function resolveModelName(
  payload: Record<string, unknown>,
  response?: Record<string, unknown>
): string {
  if (typeof payload.model === "string" && payload.model.trim().length > 0) {
    return payload.model;
  }
  if (
    response &&
    typeof response.model === "string" &&
    response.model.trim().length > 0
  ) {
    return response.model;
  }
  return "unbekanntes-Modell";
}

function readNumber(
  source: Record<string, unknown>,
  ...keys: string[]
): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

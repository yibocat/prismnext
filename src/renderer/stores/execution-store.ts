import { create } from "zustand";
import {
  isChatScopedExecution,
  terminalExecutionIsFinal,
  type TerminalExecutionEvent,
  type TerminalExecutionSummary,
} from "../../shared/execution";
import { shouldAutoOpenAiTerminal } from "@/lib/terminal/ai-prefs";
import { executionDesktop } from "@/lib/desktop-api/execution";
import { useRightPanelStore } from "./right-panel-store";

const TAIL_MAX_CHARS = 64 * 1024;

export interface ExecutionViewState {
  summary?: TerminalExecutionSummary;
  lastSequence: number;
  tail: string;
  replaying: boolean;
  error?: string;
}

interface ExecutionState {
  byId: Record<string, ExecutionViewState>;
  byToolCallId: Record<string, string>;
  byRunId: Record<string, string>;
  pinned: Record<string, boolean>;
  monitorDismissedForChat: Record<string, boolean>;
  applyEvent: (event: TerminalExecutionEvent) => void;
  applyEvents: (executionId: string, events: TerminalExecutionEvent[]) => void;
  attach: (executionId: string) => Promise<void>;
  hydrate: (executionId: string) => Promise<void>;
  findByToolCallId: (toolCallId: string) => string | undefined;
  resolveByToolCallId: (toolCallId: string) => Promise<string | undefined>;
  findByRunId: (runId: string) => string | undefined;
  listForChat: (chatTabId: string) => ExecutionViewState[];
  togglePin: (executionId: string) => void;
  markMonitorDismissed: (chatTabId: string) => void;
  clearMonitorDismissed: (chatTabId: string) => void;
  isMonitorDismissed: (chatTabId: string) => boolean;
  onExecutionCreated: (summary: TerminalExecutionSummary) => void;
  cancelForChat: (chatTabId: string) => Promise<void>;
  reset: () => void;
}

function emptyView(): ExecutionViewState {
  return { lastSequence: 0, tail: "", replaying: false };
}

function appendTail(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length <= TAIL_MAX_CHARS) return next;
  return next.slice(next.length - TAIL_MAX_CHARS);
}

function applyOne(view: ExecutionViewState, event: TerminalExecutionEvent): ExecutionViewState {
  if (event.sequence <= view.lastSequence) return view;
  const next: ExecutionViewState = {
    ...view,
    lastSequence: event.sequence,
    tail: event.type === "output" && event.data ? appendTail(view.tail, event.data) : view.tail,
  };
  if (event.state && next.summary) {
    next.summary = { ...next.summary, state: event.state, exitCode: event.exitCode ?? next.summary.exitCode };
  }
  return next;
}

function rememberIndexes(
  state: Pick<ExecutionState, "byToolCallId" | "byRunId">,
  summary?: TerminalExecutionSummary,
): Pick<ExecutionState, "byToolCallId" | "byRunId"> {
  if (!summary) return state;
  return {
    byToolCallId: summary.toolCallId
      ? { ...state.byToolCallId, [summary.toolCallId]: summary.executionId }
      : state.byToolCallId,
    byRunId: summary.runId
      ? { ...state.byRunId, [summary.runId]: summary.executionId }
      : state.byRunId,
  };
}

export const useExecutionStore = create<ExecutionState>()((set, get) => ({
  byId: {},
  byToolCallId: {},
  byRunId: {},
  pinned: {},
  monitorDismissedForChat: {},

  applyEvent(event) {
    set((state) => {
      const current = state.byId[event.executionId] ?? emptyView();
      return {
        byId: {
          ...state.byId,
          [event.executionId]: applyOne(current, event),
        },
      };
    });
    if (!get().byId[event.executionId]?.summary) {
      void get().hydrate(event.executionId);
    }
  },

  applyEvents(executionId, events) {
    set((state) => {
      let current = state.byId[executionId] ?? emptyView();
      for (const event of events) {
        if (event.executionId !== executionId) continue;
        current = applyOne(current, event);
      }
      return {
        byId: {
          ...state.byId,
          [executionId]: current,
        },
      };
    });
  },

  async attach(executionId) {
    const fromSequence = get().byId[executionId]?.lastSequence ?? 0;
    set((state) => ({
      byId: {
        ...state.byId,
        [executionId]: {
          ...(state.byId[executionId] ?? emptyView()),
          replaying: true,
        },
      },
    }));
    const result = await executionDesktop.executionReplay({ executionId, fromSequence });
    if (!result.ok) {
      set((state) => ({
        byId: {
          ...state.byId,
          [executionId]: {
            ...(state.byId[executionId] ?? emptyView()),
            replaying: false,
            error: result.error,
          },
        },
      }));
      return;
    }
    get().applyEvents(executionId, result.events);
    set((state) => ({
      byId: {
        ...state.byId,
        [executionId]: {
          ...(state.byId[executionId] ?? emptyView()),
          summary: result.summary,
          replaying: false,
          error: undefined,
        },
      },
      ...rememberIndexes(state, result.summary),
    }));
  },

  async hydrate(executionId) {
    if (get().byId[executionId]?.summary) return;
    const result = await executionDesktop.executionGet(executionId);
    if (!result?.ok) return;
    set((state) => ({
      byId: {
        ...state.byId,
        [executionId]: {
          ...(state.byId[executionId] ?? emptyView()),
          summary: result.summary,
        },
      },
      ...rememberIndexes(state, result.summary),
    }));
  },

  findByToolCallId(toolCallId) {
    if (!toolCallId) return undefined;
    const indexed = get().byToolCallId[toolCallId];
    if (indexed) return indexed;
    for (const [id, view] of Object.entries(get().byId)) {
      if (view.summary?.toolCallId === toolCallId) return id;
    }
    return undefined;
  },

  async resolveByToolCallId(toolCallId) {
    const key = (toolCallId || "").trim();
    if (!key) return undefined;
    const local = get().findByToolCallId(key);
    if (local) return local;
    const result = await executionDesktop.executionFindByToolCallId(key);
    if (!result?.ok) return undefined;
    set((state) => ({
      byId: {
        ...state.byId,
        [result.summary.executionId]: {
          ...(state.byId[result.summary.executionId] ?? emptyView()),
          summary: result.summary,
        },
      },
      ...rememberIndexes(state, result.summary),
    }));
    return result.summary.executionId;
  },

  findByRunId(runId) {
    if (!runId) return undefined;
    const indexed = get().byRunId[runId];
    if (indexed) return indexed;
    for (const [id, view] of Object.entries(get().byId)) {
      if (view.summary?.runId === runId) return id;
    }
    return undefined;
  },

  listForChat(chatTabId) {
    const key = (chatTabId || "").trim();
    if (!key) return [];
    return Object.values(get().byId)
      .filter((view) =>
        Boolean(
          view.summary
          && isChatScopedExecution(view.summary)
          && view.summary.chatTabId === key,
        ),
      )
      .sort((a, b) => (a.summary?.createdAt ?? 0) - (b.summary?.createdAt ?? 0));
  },

  togglePin(executionId) {
    set((state) => ({
      pinned: { ...state.pinned, [executionId]: !state.pinned[executionId] },
    }));
  },

  markMonitorDismissed(chatTabId) {
    const key = (chatTabId || "").trim();
    if (!key) return;
    set((state) => ({
      monitorDismissedForChat: { ...state.monitorDismissedForChat, [key]: true },
    }));
  },

  clearMonitorDismissed(chatTabId) {
    const key = (chatTabId || "").trim();
    if (!key) return;
    set((state) => {
      if (!state.monitorDismissedForChat[key]) return state;
      const next = { ...state.monitorDismissedForChat };
      delete next[key];
      return { monitorDismissedForChat: next };
    });
  },

  isMonitorDismissed(chatTabId) {
    const key = (chatTabId || "").trim();
    return Boolean(key && get().monitorDismissedForChat[key]);
  },

  onExecutionCreated(summary) {
    set((state) => ({
      byId: {
        ...state.byId,
        [summary.executionId]: {
          ...(state.byId[summary.executionId] ?? emptyView()),
          summary,
        },
      },
      ...rememberIndexes(state, summary),
    }));
    if (summary.origin !== "agent-bash") return;
    if (!shouldAutoOpenAiTerminal()) return;
    if (summary.chatTabId && get().isMonitorDismissed(summary.chatTabId)) return;
    useRightPanelStore.getState().openJobMonitor(summary.executionId);
  },

  async cancelForChat(chatTabId) {
    const key = (chatTabId || "").trim();
    if (!key) return;
    const ids = Object.values(get().byId)
      .map((view) => view.summary)
      .filter((summary): summary is TerminalExecutionSummary =>
        Boolean(
          summary
          && summary.chatTabId === key
          && summary.origin === "agent-bash"
          && !terminalExecutionIsFinal(summary.state),
        ),
      )
      .map((summary) => summary.executionId);
    await Promise.all(ids.map((id) => executionDesktop.executionCancel(id)));
  },

  reset() {
    set({ byId: {}, byToolCallId: {}, byRunId: {}, pinned: {}, monitorDismissedForChat: {} });
  },
}));

import { create } from "zustand";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import {
  aiSessionTabTitle,
  consolidateAiTabsForChat,
  findOpenAiTabForChat,
  linkAiTabToChat,
  syncAiTabTitle,
} from "@/lib/terminal/ai-session";
import { readTerminalExecutionSettings, shouldAutoOpenAiTerminal } from "@/lib/terminal/ai-prefs";
import { resolveAiMirrorKey } from "@/lib/terminal/mirror-key";
import {
  aiTabTitleWithPhase,
  shouldGcAiTerminalTab,
  type AiTerminalSessionState,
  type AiTerminalPhase,
} from "@/lib/terminal/ai-terminal-lifecycle";
import { useChatStore } from "@/stores/chat-store";
import { useExecutionStore } from "@/stores/execution-store";
import { markSessionAutoUnreadIfBackground } from "@/lib/chat/session-chrome";
import { isActiveSessionFromChatState } from "@/lib/chat/session-status";
import { lastPathForSession } from "@/stores/workbench-store";
import { useDocumentStore } from "@/stores/document-store";

export interface BashMirrorState {
  chatTabId: string;
  command: string;
  cwd?: string;
  output: string;
  exitCode?: number;
  isError?: boolean;
  status: "running" | "completed" | "denied";
}

function isAiTabOpen(aiTabId: string): boolean {
  return useRightPanelStore.getState().tabs.some((t) => t.id === aiTabId);
}

interface TerminalAiState {
  /** chatTabId → open AI tab id (invalid after user closes tab). */
  chatTabToAiTab: Record<string, string>;
  /** toolCallId → open AI tab id while tab exists. */
  toolCallToAiTab: Record<string, string>;
  /** toolCallId → owning chat tab. */
  toolCallToChatTab: Record<string, string>;
  /** User closed AI tab — suppress auto-open until reopen (keyed by session mirror key). */
  userDismissedAiTab: Record<string, boolean>;
  /** AI tab id → leftover local buffer (not the execution transcript). */
  mirrorText: Record<string, string>;
  bashByTab: Record<string, BashMirrorState>;
  bashByToolCall: Record<string, BashMirrorState>;
  /** Per-session AI terminal lifecycle (keyed by mirror log key). */
  sessionStates: Record<string, AiTerminalSessionState>;

  ensureAiTab: (chatTabId: string, toolCallId: string, command: string, cwd?: string) => string;
  onBashStart: (chatTabId: string, toolCallId: string, command: string, cwd?: string) => string;
  onBashOutput: (toolCallId: string, output: string, exitCode?: number, isError?: boolean) => void;
  /** PTY mode: update bash metadata without duplicating streamed output. */
  onBashOutputMeta: (
    toolCallId: string,
    output: string,
    exitCode?: number,
    isError?: boolean,
  ) => void;
  onBashDenied: (chatTabId: string, toolCallId: string, command: string) => void;
  onAiTabClosedByUser: (aiTabId: string) => void;
  discardAiTabUiState: (aiTabIds: string[]) => void;
  openBashInTerminal: (opts: {
    chatTabId: string;
    toolCallId: string;
    command: string;
    cwd?: string;
    output?: string;
    exitCode?: number;
    isError?: boolean;
    isDenied?: boolean;
  }) => string;
  /** Running bash: focus live tab only — never spawns PTY or replays stale widget payload. */
  focusLiveAiTerminal: (chatTabId: string, toolCallId?: string) => string;
  focusAiTab: (aiTabId: string) => void;
  getAiTabForChat: (chatTabId: string) => string | undefined;
  getAiTabForToolCall: (toolCallId: string) => string | undefined;
  getBashForToolCall: (toolCallId: string) => BashMirrorState | undefined;
  removeAiTabsForChat: (chatTabId: string) => void;
  migrateSessionMirrorLog: (chatTabId: string, sessionId: string) => void;
  touchSessionViewed: (chatTabId: string) => void;
  getSessionStateForChat: (chatTabId: string) => AiTerminalSessionState | undefined;
  getSessionStateForAiTab: (aiTabId: string) => AiTerminalSessionState | undefined;
  isAiTerminalRunningForChat: (chatTabId: string) => boolean;
  focusOrOpenAiTerminal: (chatTabId: string) => void;
  toggleAiTerminalPinned: (chatTabId: string) => void;
  sweepIdleAiTerminalTabs: () => void;
  reset: () => void;
}

function registerToolCall(
  set: (fn: (s: TerminalAiState) => Partial<TerminalAiState>) => void,
  toolCallId: string,
  chatTabId: string,
) {
  set((s) => ({
    toolCallToChatTab: { ...s.toolCallToChatTab, [toolCallId]: chatTabId },
  }));
}

function registerBashState(
  set: (fn: (s: TerminalAiState) => Partial<TerminalAiState>) => void,
  aiTabId: string | undefined,
  toolCallId: string,
  bash: BashMirrorState,
) {
  set((s) => {
    const next: Partial<TerminalAiState> = {
      bashByToolCall: { ...s.bashByToolCall, [toolCallId]: bash },
    };
    if (aiTabId) {
      next.bashByTab = { ...s.bashByTab, [aiTabId]: bash };
    }
    return next;
  });
}

function refreshAiTabTitle(
  aiTabId: string,
  command: string | undefined,
  phase: AiTerminalPhase | undefined,
): void {
  const base = aiSessionTabTitle(command);
  useRightPanelStore
    .getState()
    .updateTerminalTabTitle(aiTabId, aiTabTitleWithPhase(base, phase));
}

function upsertSessionState(
  set: (fn: (s: TerminalAiState) => Partial<TerminalAiState>) => void,
  mirrorKey: string,
  chatTabId: string,
  patch: Partial<AiTerminalSessionState>,
): void {
  const now = Date.now();
  set((s) => {
    const prev = s.sessionStates[mirrorKey];
    const next: AiTerminalSessionState = {
      ...prev,
      ...patch,
      sessionId: mirrorKey,
      chatTabId,
      phase: patch.phase ?? prev?.phase ?? "idle",
      lastViewedAt: patch.lastViewedAt ?? prev?.lastViewedAt ?? now,
    };
    return { sessionStates: { ...s.sessionStates, [mirrorKey]: next } };
  });
}

function markSessionRunning(
  set: (fn: (s: TerminalAiState) => Partial<TerminalAiState>) => void,
  chatTabId: string,
  toolCallId: string,
  command: string,
  aiTabId?: string,
): void {
  const key = resolveAiMirrorKey(chatTabId);
  const now = Date.now();
  upsertSessionState(set, key, chatTabId, {
    phase: "running",
    activeToolCallId: toolCallId,
    activeCommand: command,
    startedAt: now,
    exitedAt: undefined,
    lastViewedAt: now,
    aiTabId,
  });
  if (aiTabId) refreshAiTabTitle(aiTabId, command, "running");
}

function markSessionCompleted(
  set: (fn: (s: TerminalAiState) => Partial<TerminalAiState>) => void,
  get: () => TerminalAiState,
  chatTabId: string,
): void {
  const key = resolveAiMirrorKey(chatTabId);
  const prev = get().sessionStates[key];
  const aiTabId = findOpenAiTabForChat(chatTabId) ?? prev?.aiTabId;
  upsertSessionState(set, key, chatTabId, {
    phase: "completed",
    exitedAt: Date.now(),
    aiTabId: aiTabId && isAiTabOpen(aiTabId) ? aiTabId : undefined,
  });
  if (aiTabId && isAiTabOpen(aiTabId)) {
    refreshAiTabTitle(aiTabId, prev?.activeCommand, "completed");
  }
  const root = lastPathForSession(chatTabId) || useDocumentStore.getState().projectRoot;
  void markSessionAutoUnreadIfBackground(root, chatTabId, () =>
    isActiveSessionFromChatState(chatTabId, useChatStore.getState()),
  );
}

export const useTerminalAiStore = create<TerminalAiState>()((set, get) => ({
  chatTabToAiTab: {},
  toolCallToAiTab: {},
  toolCallToChatTab: {},
  userDismissedAiTab: {},
  mirrorText: {},
  bashByTab: {},
  bashByToolCall: {},
  sessionStates: {},

  ensureAiTab: (chatTabId, toolCallId, command, _cwd) => {
    const consolidated = consolidateAiTabsForChat(chatTabId);
    const fromPanel = consolidated ?? findOpenAiTabForChat(chatTabId);
    const mapped = get().chatTabToAiTab[chatTabId];
    const existing = fromPanel ?? (mapped && isAiTabOpen(mapped) ? mapped : undefined);

    if (existing) {
      linkAiTabToChat(existing, chatTabId, toolCallId);
      syncAiTabTitle(existing, command);
      set((s) => ({
        chatTabToAiTab: { ...s.chatTabToAiTab, [chatTabId]: existing },
        toolCallToAiTab: { ...s.toolCallToAiTab, [toolCallId]: existing },
        userDismissedAiTab: { ...s.userDismissedAiTab, [resolveAiMirrorKey(chatTabId)]: false },
      }));
      return existing;
    }

    const executionId = useExecutionStore.getState().findByToolCallId(toolCallId);
    const aiTabId = executionId
      ? useRightPanelStore.getState().openJobMonitor(executionId)
      : "";
    if (!aiTabId) return "";
    set((s) => ({
      chatTabToAiTab: { ...s.chatTabToAiTab, [chatTabId]: aiTabId },
      toolCallToAiTab: { ...s.toolCallToAiTab, [toolCallId]: aiTabId },
      userDismissedAiTab: { ...s.userDismissedAiTab, [resolveAiMirrorKey(chatTabId)]: false },
    }));
    upsertSessionState(set, resolveAiMirrorKey(chatTabId), chatTabId, {
      aiTabId,
      lastViewedAt: Date.now(),
    });
    return aiTabId;
  },

  onBashStart: (chatTabId, toolCallId, command, cwd) => {
    const autoOpen = shouldAutoOpenAiTerminal();

    if (get().toolCallToChatTab[toolCallId]) {
      const openId = consolidateAiTabsForChat(chatTabId) ?? findOpenAiTabForChat(chatTabId);
      markSessionRunning(set, chatTabId, toolCallId, command, openId || undefined);
      if (openId && autoOpen) get().focusAiTab(openId);
      return openId ?? "";
    }

    registerToolCall(set, toolCallId, chatTabId);
    const bash: BashMirrorState = {
      chatTabId,
      command,
      cwd,
      output: "",
      status: "running",
    };

    const openId = consolidateAiTabsForChat(chatTabId) ?? findOpenAiTabForChat(chatTabId);

    if (openId) {
      set((s) => ({
        chatTabToAiTab: { ...s.chatTabToAiTab, [chatTabId]: openId },
        toolCallToAiTab: { ...s.toolCallToAiTab, [toolCallId]: openId },
      }));
      linkAiTabToChat(openId, chatTabId, toolCallId);
      syncAiTabTitle(openId, command);
      registerBashState(set, openId, toolCallId, bash);
      markSessionRunning(set, chatTabId, toolCallId, command, openId);
      if (autoOpen) get().focusAiTab(openId);
      return openId;
    }

    registerBashState(set, undefined, toolCallId, bash);
    markSessionRunning(set, chatTabId, toolCallId, command);
    return "";
  },

  onBashOutput: (toolCallId, output, exitCode, isError) => {
    const prev = get().bashByToolCall[toolCallId];
    const chatTabId = get().toolCallToChatTab[toolCallId] ?? prev?.chatTabId;
    if (!chatTabId) return;

    const merged: BashMirrorState = {
      chatTabId,
      command: prev?.command ?? "",
      cwd: prev?.cwd,
      output: output || prev?.output || "",
      exitCode,
      isError,
      status: "completed",
    };

    const openId = findOpenAiTabForChat(chatTabId);
    if (openId) {
      set((s) => ({
        toolCallToAiTab: { ...s.toolCallToAiTab, [toolCallId]: openId },
        chatTabToAiTab: { ...s.chatTabToAiTab, [chatTabId]: openId },
      }));
    }
    registerBashState(set, openId, toolCallId, merged);
    markSessionCompleted(set, get, chatTabId);
  },

  onBashOutputMeta: (toolCallId, output, exitCode, isError) => {
    const prev = get().bashByToolCall[toolCallId];
    const chatTabId = get().toolCallToChatTab[toolCallId] ?? prev?.chatTabId;
    if (!chatTabId) return;

    const merged: BashMirrorState = {
      chatTabId,
      command: prev?.command ?? "",
      cwd: prev?.cwd,
      output: output || prev?.output || "",
      exitCode,
      isError,
      status: "completed",
    };

    const openId = findOpenAiTabForChat(chatTabId);
    registerBashState(set, openId, toolCallId, merged);
    markSessionCompleted(set, get, chatTabId);
  },

  onBashDenied: (chatTabId, toolCallId, command) => {
    registerToolCall(set, toolCallId, chatTabId);
    registerBashState(set, undefined, toolCallId, {
      chatTabId,
      command,
      output: "",
      status: "denied",
      isError: true,
    });
  },

  onAiTabClosedByUser: (aiTabId) => {
    set((s) => {
      const tab = useRightPanelStore.getState().tabs.find((t) => t.id === aiTabId);
      const chatTabId =
        (tab?.kind === "terminal" ? tab.linkedChatTabId : undefined)
        ?? Object.entries(s.chatTabToAiTab).find(([, id]) => id === aiTabId)?.[0];
      const nextChat = { ...s.chatTabToAiTab };
      if (chatTabId) delete nextChat[chatTabId];

      const nextTool: Record<string, string> = {};
      for (const [k, v] of Object.entries(s.toolCallToAiTab)) {
        if (v !== aiTabId) nextTool[k] = v;
      }

      const nextMirror = { ...s.mirrorText };
      delete nextMirror[aiTabId];
      const nextBashTab = { ...s.bashByTab };
      delete nextBashTab[aiTabId];

      const nextDismissed = { ...s.userDismissedAiTab };
      if (chatTabId) {
        const key = resolveAiMirrorKey(chatTabId);
        nextDismissed[key] = true;
        if (key !== chatTabId) delete nextDismissed[chatTabId];
      }

      const nextSessionStates = { ...s.sessionStates };
      if (chatTabId) {
        const key = resolveAiMirrorKey(chatTabId);
        const prevState = nextSessionStates[key];
        if (prevState) {
          nextSessionStates[key] = {
            ...prevState,
            phase: "dismissed",
            aiTabId: undefined,
          };
        }
      }

      return {
        chatTabToAiTab: nextChat,
        toolCallToAiTab: nextTool,
        mirrorText: nextMirror,
        bashByTab: nextBashTab,
        userDismissedAiTab: nextDismissed,
        sessionStates: nextSessionStates,
      };
    });
  },

  discardAiTabUiState: (aiTabIds) => {
    if (aiTabIds.length === 0) return;
    set((s) => {
      const nextMirror = { ...s.mirrorText };
      const nextBashTab = { ...s.bashByTab };
      for (const id of aiTabIds) {
        delete nextMirror[id];
        delete nextBashTab[id];
      }
      return { mirrorText: nextMirror, bashByTab: nextBashTab };
    });
  },

  openBashInTerminal: (opts) => {
    const { chatTabId, toolCallId } = opts;
    const executionId = useExecutionStore.getState().findByToolCallId(toolCallId);
    if (executionId) {
      useExecutionStore.getState().clearMonitorDismissed(chatTabId);
      return useRightPanelStore.getState().openJobMonitor(executionId);
    }
    return "";
  },

  focusLiveAiTerminal: (chatTabId, toolCallId) => {
    const fromTool = toolCallId ? get().getAiTabForToolCall(toolCallId) : undefined;
    const openId =
      fromTool
      ?? consolidateAiTabsForChat(chatTabId)
      ?? findOpenAiTabForChat(chatTabId);

    if (openId) {
      if (toolCallId) {
        linkAiTabToChat(openId, chatTabId, toolCallId);
        set((s) => ({
          chatTabToAiTab: { ...s.chatTabToAiTab, [chatTabId]: openId },
          toolCallToAiTab: { ...s.toolCallToAiTab, [toolCallId]: openId },
          userDismissedAiTab: { ...s.userDismissedAiTab, [resolveAiMirrorKey(chatTabId)]: false },
        }));
      }
      get().focusAiTab(openId);
      return openId;
    }

    get().focusOrOpenAiTerminal(chatTabId);
    return get().getAiTabForChat(chatTabId) ?? "";
  },

  focusAiTab: (aiTabId) => {
    if (!isAiTabOpen(aiTabId)) return;
    const tab = useRightPanelStore.getState().tabs.find((t) => t.id === aiTabId);
    if (tab?.kind === "terminal" && tab.linkedChatTabId) {
      get().touchSessionViewed(tab.linkedChatTabId);
    }
    useLayoutStore.getState().requestRightAreaExpand();
    useRightPanelStore.getState().setActiveTab(aiTabId);
  },

  getAiTabForChat: (chatTabId) => {
    const id = findOpenAiTabForChat(chatTabId) ?? get().chatTabToAiTab[chatTabId];
    return id && isAiTabOpen(id) ? id : undefined;
  },

  getAiTabForToolCall: (toolCallId) => {
    const id = get().toolCallToAiTab[toolCallId];
    return id && isAiTabOpen(id) ? id : undefined;
  },

  getBashForToolCall: (toolCallId) => get().bashByToolCall[toolCallId],

  removeAiTabsForChat: (chatTabId) => {
    const aiTabId = findOpenAiTabForChat(chatTabId) ?? get().chatTabToAiTab[chatTabId];
    if (aiTabId && isAiTabOpen(aiTabId)) {
      useRightPanelStore.getState().closeAiTab(aiTabId);
    }
    set((s) => {
      const nextChat = { ...s.chatTabToAiTab };
      delete nextChat[chatTabId];
      const nextTool: Record<string, string> = {};
      for (const [k, v] of Object.entries(s.toolCallToAiTab)) {
        if (v !== aiTabId) nextTool[k] = v;
      }
      const nextToolChat = { ...s.toolCallToChatTab };
      for (const [k, v] of Object.entries(nextToolChat)) {
        if (v === chatTabId) delete nextToolChat[k];
      }
      const nextMirror = { ...s.mirrorText };
      if (aiTabId) delete nextMirror[aiTabId];
      const nextBashTab = { ...s.bashByTab };
      if (aiTabId) delete nextBashTab[aiTabId];
      const nextBashTool: Record<string, BashMirrorState> = {};
      for (const [k, v] of Object.entries(s.bashByToolCall)) {
        if (v.chatTabId !== chatTabId) nextBashTool[k] = v;
      }
      return {
        chatTabToAiTab: nextChat,
        toolCallToAiTab: nextTool,
        toolCallToChatTab: nextToolChat,
        mirrorText: nextMirror,
        bashByTab: nextBashTab,
        bashByToolCall: nextBashTool,
      };
    });
  },

  migrateSessionMirrorLog: (chatTabId, sessionId) => {
    set((s) => {
      const nextDismissed = { ...s.userDismissedAiTab };
      if (chatTabId !== sessionId && nextDismissed[chatTabId]) {
        nextDismissed[sessionId] = true;
        delete nextDismissed[chatTabId];
      }
      const nextSessionStates = { ...s.sessionStates };
      if (chatTabId !== sessionId && nextSessionStates[chatTabId]) {
        nextSessionStates[sessionId] = {
          ...nextSessionStates[chatTabId],
          sessionId,
          chatTabId,
        };
        delete nextSessionStates[chatTabId];
      }
      return {
        userDismissedAiTab: nextDismissed,
        sessionStates: nextSessionStates,
      };
    });
  },

  touchSessionViewed: (chatTabId) => {
    const key = resolveAiMirrorKey(chatTabId);
    const prev = get().sessionStates[key];
    if (!prev) return;
    upsertSessionState(set, key, chatTabId, { lastViewedAt: Date.now() });
  },

  getSessionStateForChat: (chatTabId) => {
    return get().sessionStates[resolveAiMirrorKey(chatTabId)];
  },

  getSessionStateForAiTab: (aiTabId) => {
    const tab = useRightPanelStore.getState().tabs.find((t) => t.id === aiTabId);
    const chatTabId =
      (tab?.kind === "terminal" ? tab.linkedChatTabId : undefined)
      ?? Object.entries(get().chatTabToAiTab).find(([, id]) => id === aiTabId)?.[0];
    if (!chatTabId) return undefined;
    return get().getSessionStateForChat(chatTabId);
  },

  isAiTerminalRunningForChat: (chatTabId) => {
    return get().getSessionStateForChat(chatTabId)?.phase === "running";
  },

  focusOrOpenAiTerminal: (chatTabId) => {
    const openId = get().getAiTabForChat(chatTabId);
    if (openId) {
      get().focusAiTab(openId);
      return;
    }
    const toolCallId = Object.entries(get().toolCallToChatTab).find(([, id]) => id === chatTabId)?.[0];
    const executionId = toolCallId
      ? useExecutionStore.getState().findByToolCallId(toolCallId)
      : undefined;
    if (!executionId) return;
    useExecutionStore.getState().clearMonitorDismissed(chatTabId);
    useRightPanelStore.getState().openJobMonitor(executionId);
  },

  toggleAiTerminalPinned: (chatTabId) => {
    const key = resolveAiMirrorKey(chatTabId);
    const prev = get().sessionStates[key];
    upsertSessionState(set, key, chatTabId, {
      pinned: !(prev?.pinned ?? false),
    });
  },

  sweepIdleAiTerminalTabs: () => {
    const settings = readTerminalExecutionSettings();
    const postExitGraceMs = settings.jobMonitorKeepFinishedMs;
    const idleCloseMs = settings.jobMonitorIdleCloseMs;

    const activeSessionId = useChatStore.getState().sessionId;
    const now = Date.now();
    const gcSettings = { postExitGraceMs, idleCloseMs };

    for (const state of Object.values(get().sessionStates)) {
      if (!shouldGcAiTerminalTab(state, now, activeSessionId, gcSettings)) continue;
      if (!state.aiTabId || !isAiTabOpen(state.aiTabId)) continue;
      useRightPanelStore.getState().removeAiTabSilently(state.aiTabId);
      upsertSessionState(set, state.sessionId, state.chatTabId, {
        aiTabId: undefined,
      });
    }
  },

  reset: () => {
    set({
      chatTabToAiTab: {},
      toolCallToAiTab: {},
      toolCallToChatTab: {},
      userDismissedAiTab: {},
      mirrorText: {},
      bashByTab: {},
      bashByToolCall: {},
      sessionStates: {},
    });
  },
}));

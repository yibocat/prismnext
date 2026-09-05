import type { StateCreator } from "zustand";
import type { ChatState } from "./model";
import type { TabDraft, TabState } from "./model";
import {
  applyConversationToTab,
  cacheTabMessages,
  dropTitle,
  makeDefaultTab,
  msgCacheSet,
  projectActiveTab,
  refreshAgentSessionList,
  syncCheckoutForTab,
  syncCitationStagingForTab,
} from "./model";
import { toast } from "sonner";
import { i18n } from "@/lib/i18n";
import { truncateChatMessagesToTurn } from "@/lib/chat/chat-turns";
import { agentDesktop } from "@/lib/desktop-api/agent";
import { researchDesktop } from "@/lib/desktop-api/research";
import { emptyConversation, newConversationId } from "../../../shared/agent/conversation";
import { useDocumentStore } from "../document-store";
import { lastPathForSession, sameProjectPath, useWorkbenchStore } from "../workbench-store";
import { applyCheckoutTransition, attachWorktreeForSessionDirectory, captureSessionCwd, isWorktreeCheckoutPath } from "@/lib/git/checkout-context";
import { useWorktreeStore } from "../worktree-store";
import { persistAndSyncIntensiveReading, resolveIntensivePaperIdsForSession } from "@/lib/literature/sync-intensive-reading";
import { dismissTodoPlan as persistTodoPlanDismiss } from "@/lib/chat/composer-pending-tools";
import { pruneDisposableEmptyChatTabs } from "@/lib/chat/session-title";
import { markSessionRead } from "@/lib/chat/session-chrome";
import { clearTurnWindowState } from "@/lib/chat/turn-window";
import type { SessionAgent } from "../../../shared/agent/session-agent";
import { isAgentRuntime, type ChatRuntimeKind } from "../../../shared/agent/api";

export const createChatTabsSlice: StateCreator<ChatState, [], [], Partial<ChatState>> = (set, get) => ({
  dismissTodoPlan: (toolUseId: string) => {
    persistTodoPlanDismiss(toolUseId);
    set((s) => ({ todoPlanDismissEpoch: (s.todoPlanDismissEpoch || 0) + 1 }));
  },

  // ─── Tab Management ───

  createTab: (opts) => {
    const id = newConversationId();
    const tab = makeDefaultTab(id);
    if (opts?.runtime) {
      tab.runtime = opts.runtime;
    }
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: id,
      ...projectActiveTab([...s.tabs, tab], id),
    }));
    const focusProjectId = useWorkbenchStore.getState().focusProjectId;
    if (focusProjectId) {
      useWorkbenchStore.getState().recordSessionProject(id, focusProjectId);
    }
    useWorkbenchStore.getState().setFocusConversation(id);
    syncCheckoutForTab(tab);
    syncCitationStagingForTab(tab);
    // Fire-and-forget runtime prewarm: build the Pi session in the background
    // so the first send skips runtime/MCP/prompt-assembly startup entirely.
    // The main process swallows failures and send() rebuilds on mismatch.
    if (isAgentRuntime(tab.runtime)) {
      const root = useDocumentStore.getState().projectRoot;
      if (root) {
        // Optional chaining: electronAPI may lack the bridge in tests/host.
        void agentDesktop.agentPrewarm({
          conversationId: id,
          tabId: id,
          projectRoot: root,
          sessionTeamId: tab.sessionTeamId,
        })?.catch?.(() => {});
      }
    }
    return id;
  },

  closeTab: (id: string) => {
    const { tabs, activeTabId } = get();
    if (tabs.length <= 1) return;
    const closingTab = tabs.find((t) => t.id === id);
    if (!closingTab || closingTab.isStreaming) return;

    // Snapshot before remove — otherwise reopen hits a stale first-hydrate cache
    // and drops Approve/Deny cards + Build execution that only lived on the tab.
    cacheTabMessages(closingTab.sessionId, closingTab.messages);

    const newTabs = tabs.filter((t) => t.id !== id);
    let newActiveId = activeTabId;
    if (activeTabId === id) {
      const idx = tabs.findIndex((t) => t.id === id);
      const newIdx = Math.max(0, Math.min(idx, newTabs.length - 1));
      newActiveId = newTabs[newIdx].id;
    }
    let hydratedTabs = newTabs;
    set({
      tabs: hydratedTabs,
      activeTabId: newActiveId,
      lastTitleByTab: dropTitle(get().lastTitleByTab, id),
      ...projectActiveTab(hydratedTabs, newActiveId),
    });
    syncCheckoutForTab(hydratedTabs.find((t) => t.id === newActiveId));
    syncCitationStagingForTab(hydratedTabs.find((t) => t.id === newActiveId));
    clearTurnWindowState(id);
    void import("../stream-store").then(({ useStreamStore }) => {
      useStreamStore.getState().endTurn(id);
    });

      // Clean up agent session for this tab — cancel any running prompt
      if (isAgentRuntime(closingTab.runtime)) {
        agentDesktop.agentCancel({ conversationId: id }).catch(() => {});
        agentDesktop.agentDispose({ conversationId: id }).catch(() => {});
      }
      void import("../checkpoint-store").then(({ useCheckpointStore }) => {
        useCheckpointStore.getState().clearTab(id);
      });
      void import("../terminal-ai-store").then(({ useTerminalAiStore }) => {
        useTerminalAiStore.getState().removeAiTabsForChat(id);
      });
      void import("../execution-store").then(({ useExecutionStore }) => {
        void useExecutionStore.getState().cancelForChat(id);
      });
  },

  renameSession: async (tabId, title) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    const nextTitle = title.trim();
    if (!nextTitle) return;
    const conversationId = tab?.id || tabId;
    await agentDesktop.agentRenameSession({
      conversationId,
      title: nextTitle,
    });
    refreshAgentSessionList();
    if (!tab) return;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, title: nextTitle, userTitleSet: true } : t,
      ),
      lastTitleByTab: { ...s.lastTitleByTab, [tabId]: tab.title },
    }));
  },

  undoRenameSession: async (tabId) => {
    const previous = get().lastTitleByTab[tabId];
    if (previous === undefined) return;
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    await agentDesktop.agentRenameSession({
      conversationId: tabId,
      title: previous,
    });
    refreshAgentSessionList();
    set((s) => {
      const updated = s.tabs.map((t) =>
        t.id === tabId ? { ...t, title: previous, userTitleSet: true } : t,
      );
      return { tabs: updated, lastTitleByTab: dropTitle(s.lastTitleByTab, tabId) };
    });
  },

  moveTab: (fromIndex: number, toIndex: number) => {
    set((s) => {
      if (
        fromIndex < 0
        || toIndex < 0
        || fromIndex >= s.tabs.length
        || toIndex >= s.tabs.length
        || fromIndex === toIndex
      ) {
        return s;
      }
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(fromIndex, 1);
      if (!moved) return s;
      tabs.splice(toIndex, 0, moved);
      return { tabs };
    });
  },

  setActiveTab: (id: string) => {
    const { tabs, activeTabId } = get();
    if (id === activeTabId) return;
    const targetTab = tabs.find((t) => t.id === id);
    set({
      tabs,
      activeTabId: id,
      ...projectActiveTab(tabs, id),
    });
    useWorkbenchStore.getState().setFocusConversation(id);
    const mapped = lastPathForSession(id);
    const currentRoot = useDocumentStore.getState().projectRoot;
    if (mapped && !sameProjectPath(mapped, currentRoot)) {
      void useDocumentStore.getState().focusProject(mapped);
    }
    syncCheckoutForTab(targetTab);
    syncCitationStagingForTab(targetTab);
    void import("../terminal-ai-store").then(({ useTerminalAiStore }) => {
      useTerminalAiStore.getState().touchSessionViewed(id);
    });
  },

  saveDraft: (tabId: string, draft: TabDraft) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, draft } : t)),
    }));
  },

  addIntensivePaper: (tabId: string, paperId: string) => {
    if (!paperId) return;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId && !t.intensivePaperIds.includes(paperId)
          ? { ...t, intensivePaperIds: [...t.intensivePaperIds, paperId] }
          : t,
      ),
    }));
    const tab = get().tabs.find((t) => t.id === tabId);
    persistAndSyncIntensiveReading(tab?.sessionId, tab?.intensivePaperIds ?? []);
  },

  removeIntensivePaper: (tabId: string, paperId: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, intensivePaperIds: t.intensivePaperIds.filter((id) => id !== paperId) }
          : t,
      ),
    }));
    const tab = get().tabs.find((t) => t.id === tabId);
    persistAndSyncIntensiveReading(tab?.sessionId, tab?.intensivePaperIds ?? []);
  },

  clearIntensivePapers: (tabId: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, intensivePaperIds: [] } : t,
      ),
    }));
    const tab = get().tabs.find((t) => t.id === tabId);
    persistAndSyncIntensiveReading(tab?.sessionId, []);
  },

  setSessionAgent: (agent: SessionAgent, tabId?: string) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    let clearedOrchestrator = false;
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== resolvedTabId) return t;
        if (agent === "plan" && t.orchestratorId) clearedOrchestrator = true;
        return {
          ...t,
          sessionAgent: agent,
          ...(agent === "plan"
            ? {
                orchestratorId: null,
                planSuggestVisible: false,
                planSuggestReason: null,
                planSuggestDeadlineAt: null,
                planSuggestConsentSessionId: null,
              }
            : {}),
        };
      }),
    }));
    if (clearedOrchestrator) {
      toast.message(i18n.t("chat.sessionAgent.orchestratorCleared"));
    }
    if (agent === "plan") {
      // Interactive enter Plan — allow composer confirm when draft becomes ready.
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === resolvedTabId ? { ...t, planConfirmSuppressed: false } : t,
        ),
      }));
      void get().refreshPlanDraftFromDisk(resolvedTabId);
    }
  },

  requestSetSessionAgent: (agent: SessionAgent, tabId?: string) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    const tab = get().tabs.find((t) => t.id === resolvedTabId);
    if (!tab) return;
    if (
      agent === "build"
      && tab.sessionAgent === "plan"
      && (tab.planDraftFileReady || tab.planDraftDirty)
    ) {
      get().openPlanExitDialog(resolvedTabId);
      return;
    }
    get().setSessionAgent(agent, resolvedTabId);
  },

  setSessionTeamId: (tabId, teamId) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, sessionTeamId: teamId, orchestratorId: null }
          : t,
      ),
    }));
  },

  /**
   * Settings (or any project-default change) won — clear tab overrides so
   * Composer follows `teams.json.defaultTeam` instead of a stale sessionTeamId.
   */
  clearSessionTeamOverrides: () => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.sessionTeamId == null && t.orchestratorId == null
          ? t
          : { ...t, sessionTeamId: null, orchestratorId: null },
      ),
    }));
  },

  restorePendingPlanModeIfNeeded: async (tabId?: string) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    const tab = get().tabs.find((t) => t.id === resolvedTabId);
    const projectRoot = useDocumentStore.getState().projectRoot;
    const sessionId = tab?.sessionId?.trim();
    if (!tab || !projectRoot || !sessionId) return false;

    const pending = await researchDesktop.researchPlanHasPendingDraft({
      projectRoot,
      sessionId,
    });
    if (!pending.ok || !pending.pending) return false;

    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== resolvedTabId) return t;
        return {
          ...t,
          sessionAgent: "plan" as SessionAgent,
          planConfirmSuppressed: true,
          orchestratorId: null,
          planSuggestVisible: false,
          planSuggestReason: null,
        };
      }),
    }));
    await get().refreshPlanDraftFromDisk(resolvedTabId);
    return true;
  },

  newSession: () => {
    const id = get().createTab();
    get().setActiveTab(id);
    syncCheckoutForTab(get().tabs.find((t) => t.id === id));
  },

  newPiSession: () => {
    get().newSession();
  },

  clearAllSessions: () => {
    for (const tab of get().tabs) {
      void agentDesktop.agentDispose({ conversationId: tab.id })?.catch?.(() => {});
    }
    const id = newConversationId();
    const tab = makeDefaultTab(id);
    set({
      tabs: [tab],
      activeTabId: id,
      ...projectActiveTab([tab], id),
    });
  },

  clearCurrentTab: () => {
    const tabId = get().activeTabId;
    const tab = get().tabs.find((t) => t.id === tabId);
    if (tab?.isStreaming) return; // Never clear a tab with an active agent
    if (isAgentRuntime(tab?.runtime)) {
      agentDesktop.agentDispose({ conversationId: tabId }).catch(() => {});
    }
    set((s) => {
      const tabs = s.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              messages: [],
              streamingMessage: null,
              conversation: emptyConversation({ conversationId: tabId }),
              sessionId: tabId,
              sessionCwd: null,
              title: "New Chat",
              userTitleSet: false,
              autoTitleAttempted: false,
              error: null,
              isStreaming: false,
              promptStale: false,
              isLoadingSession: false,
            }
          : t,
      );
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
    void import("../checkpoint-store").then(({ useCheckpointStore }) => {
      useCheckpointStore.getState().clearTab(tabId);
    });
  },

  checkPromptStale: async (tabId?: string) => {
    const id = tabId ?? get().activeTabId;
    get()._setPromptStale(id, false);
  },

  truncateToTurn: (tabId, turnIndex) => {
    set((s) => {
      const tabs = s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const messages = truncateChatMessagesToTurn(t.messages, turnIndex);
        // Truncation = this is now the complete dataset
        if (t.sessionId) {
          msgCacheSet(t.sessionId, messages);
        }
        return {
          ...t,
          messages,
          conversation: {
            ...t.conversation,
            turns: t.conversation.turns.filter((turn) => turn.turnIndex <= turnIndex),
            live: null,
          },
          streamingMessage: null,
          isStreaming: false,
          error: null,
        };
      });
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
  },

  restoreConversation: (tabId, conversation) => {
    set((s) => {
      const tabs = s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        return {
          ...applyConversationToTab(t, { ...conversation, live: null }),
          streamingMessage: null,
          isStreaming: false,
          error: null,
        };
      });
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
  },

  applyConversationCompact: (tabId, compacted) => {
    set((s) => {
      const tabs = s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        return applyConversationToTab(t, {
          ...t.conversation,
          compacted: {
            throughTurnIndex: compacted.throughTurnIndex,
            ...(compacted.summary ? { summary: compacted.summary } : {}),
            at: Date.now(),
          },
          usage: t.conversation.usage
            ? {
                ...t.conversation.usage,
                inputTokens: undefined,
                breakdown: undefined,
              }
            : t.conversation.usage,
        });
      });
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
  },

  restoreMessages: (tabId, messages) => {
    set((s) => {
      const tabs = s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        // Restored messages = complete dataset
        if (t.sessionId) {
          msgCacheSet(t.sessionId, messages);
        }
        return {
          ...t,
          messages,
          streamingMessage: null,
          isStreaming: false,
          error: null,
        };
      });
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
  },

  resyncTabMessagesFromDisk: async (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    const projectPath = useDocumentStore.getState().projectRoot || "";
    const conversationId = tab?.conversation.conversationId || tab?.id;
    if (!tab || !conversationId || !projectPath) return;
    const result = await agentDesktop.agentLoadSession({
      conversationId,
      projectRoot: projectPath,
    });
    if (!result.ok || !result.conversation) return;
    const conversation = result.conversation;
    set((s) => {
      const tabs = s.tabs.map((t) =>
        t.id === tabId
          ? {
              ...applyConversationToTab(t, conversation, { planEvents: result.planEvents }),
              title: result.title || t.title,
              error: null,
              isLoadingSession: false,
            }
          : t,
      );
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
  },

  loadSession: async (
    conversationId: string,
    sessionDirectory?: string,
    projectLastPath?: string,
    opts?: { connectRemote?: boolean },
  ) => {
    if (!conversationId.trim()) return;
    const mappedPath = projectLastPath || lastPathForSession(conversationId);
    const currentRoot = useDocumentStore.getState().projectRoot || "";
    if (mappedPath && !sameProjectPath(mappedPath, currentRoot)) {
      await useDocumentStore.getState().focusProject(mappedPath, opts);
    }
    const projectPath = useDocumentStore.getState().projectRoot || mappedPath || "";
    if (!projectPath) return;
    useWorkbenchStore.getState().setFocusConversation(conversationId);

    const existingTab = get().tabs.find((t) => (
      t.id === conversationId
      || t.conversation.conversationId === conversationId
      || t.sessionId === conversationId
    ));
    if (existingTab) {
      const nextTabs = pruneDisposableEmptyChatTabs(get().tabs, existingTab.id);
      const directory = sessionDirectory ?? existingTab.sessionCwd ?? projectPath;
      if (directory && directory !== projectPath) {
        await attachWorktreeForSessionDirectory(directory);
      } else {
        await applyCheckoutTransition({ type: "local" });
      }
      set({
        tabs: nextTabs,
        activeTabId: existingTab.id,
        ...projectActiveTab(nextTabs, existingTab.id),
      });
      void markSessionRead(projectPath, conversationId);
      return;
    }

    const tabId = conversationId;
    const loadingTab: TabState = {
      ...makeDefaultTab(tabId),
      runtime: "pi",
      legacyReadOnly: false,
      sessionId: tabId,
      sessionCwd: sessionDirectory ?? projectPath,
      isLoadingSession: true,
      composerToolsSuppressed: true,
    };
    set((s) => {
      const kept = pruneDisposableEmptyChatTabs(s.tabs);
      const tabs = [...kept, loadingTab];
      return {
        tabs,
        activeTabId: tabId,
        ...projectActiveTab(tabs, tabId),
      };
    });

    try {
      const result = await agentDesktop.agentLoadSession({
        conversationId,
        projectRoot: projectPath,
      });
      if (!result.ok || !result.conversation) {
        throw new Error(result.error || "unknown_conversation");
      }
      const directory = sessionDirectory ?? result.directory ?? projectPath;
      if (directory && directory !== projectPath) {
        await attachWorktreeForSessionDirectory(directory);
      } else {
        await applyCheckoutTransition({ type: "local" });
      }
      const conversation = result.conversation;
      const hydratedTab: TabState = {
        ...applyConversationToTab(loadingTab, conversation, { planEvents: result.planEvents }),
        title: result.title || conversation.title || "New Chat",
        autoTitleAttempted: true,
        sessionCwd: directory,
        isLoadingSession: false,
        composerToolsSuppressed: true,
      };
      set((s) => {
        const tabs = s.tabs.map((t) => (t.id === tabId ? hydratedTab : t));
        return { tabs, activeTabId: tabId, ...projectActiveTab(tabs, tabId) };
      });
      persistAndSyncIntensiveReading(tabId, hydratedTab.intensivePaperIds);
      syncCitationStagingForTab(hydratedTab);
      const member = useWorkbenchStore.getState().members.find((item) =>
        sameProjectPath(item.lastPath, projectPath),
      );
      if (member) {
        useWorkbenchStore.getState().recordSessionProject(conversationId, member.id);
      }
      void markSessionRead(projectPath, conversationId);
    } catch (err: any) {
      set((s) => {
        const tabs = s.tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                error: `Failed to load session: ${err?.message || String(err)}`,
                isLoadingSession: false,
              }
            : t,
        );
        return { tabs, activeTabId: tabId, ...projectActiveTab(tabs, tabId) };
      });
    }
  },

});

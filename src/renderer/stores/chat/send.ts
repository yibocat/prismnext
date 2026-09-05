import type { StateCreator } from "zustand";
import type { ChatState } from "./model";
import type { ChatStreamMessage, ContentBlock, SubAgentRun } from "./model";
import {
  applyConversationToTab,
  cacheTabMessages,
  collectCommittedToolUseIds,
  collectSettledToolResultIds,
  contentBlocksText,
  finalizeStreamingForMutation,
  formatAgentSendError,
  hasIncompleteTaskInBlocks,
  mergeSubAgentSnapshotBlocks,
  mergeTurnMeta,
  newClientTurnId,
  persistTurnMetaToDisk,
  persistableAttachmentsFromUserBlocks,
  projectActiveTab,
  refreshAgentSessionList,
  upsertSubAgentBlock,
  withSettledStreamMessageId,
} from "./model";
import { toast } from "sonner";
import { i18n } from "@/lib/i18n";
import { agentDesktop } from "@/lib/desktop-api/agent";
import { isAgentRuntime } from "../../../shared/agent/api";
import { parseRemoteAbs } from "@shared/remote";
import { ensureRemoteLiveForWork } from "@/lib/remote/ensure-connected";
import { pauseAutoCompileForAi, resumeAutoCompileAfterAi } from "../compile-store";
import { useDocumentStore } from "../document-store";
import { useStreamStore, streamTabState } from "../stream-store";
import { lastPathForSession, useWorkbenchStore } from "../workbench-store";
import { markSessionAutoUnreadIfBackground } from "@/lib/chat/session-chrome";
import { isActiveSessionFromChatState } from "@/lib/chat/session-status";
import { applyCheckoutTransition, captureSessionCwd, isPendingNewWorktree, resolveWorktreePathForSend } from "@/lib/git/checkout-context";
import { useWorktreeStore } from "../worktree-store";
import { useSettingsStore } from "../settings-store";
import { isToolResultUserMessage, truncateChatMessagesToTurn } from "@/lib/chat/chat-turns";
import { reconcileBackgroundSubAgentRunsFromMessages } from "@/lib/chat/reconcile-background-tasks";
import {
  acknowledgeQuestionAnswer as applyQuestionAnswerToConversation,
  appendAssistantBlocksToLastTurn,
  applyConversationEvent,
  beginConversationTurn,
  ensureTaskRunFromTranscript,
  markSubagentStopping,
} from "@/lib/chat/conversation-reducer";
import type { AgentEvent } from "../../../shared/agent/runtime";
import type { Conversation, TurnMessageMeta } from "../../../shared/agent/conversation";
import {
  countCompletedContentTurns,
  deriveSessionTitleForSend,
  extractSessionTitle,
  firstCompletedTurnExcerpts,
  isGenericSessionTitle,
  resolveProductConversationId,
  shouldRequestGeneratedSessionTitle,
} from "@/lib/chat/session-title";
import { resolveTurnModelLabel } from "@/lib/chat/turn-model-label";
import {
  persistAndSyncIntensiveReading,
  resolveIntensivePaperIdsForSession,
} from "@/lib/literature/sync-intensive-reading";
import { captureLiteratureStageFromToolResult } from "@/lib/literature/sync-citation-staging-from-messages";
import type { ChatPreparePhase } from "../../../shared/chat/prepare-phases";
import type { ContextUsageBreakdown } from "../../../shared/agent/context-usage";

export const createChatSendSlice: StateCreator<ChatState, [], [], Partial<ChatState>> = (set, get) => ({
  sendPrompt: async (
    userPrompt: string,
    userContent?: ContentBlock[],
    skipUserMessage?: boolean,
    composerExtras?: {
      mcpServerAllowlist?: string[];
      skillIds?: string[];
      hasPaperSnippets?: boolean;
      selectedExpertIds?: string[];
      orchestratorId?: string | null;
      sessionTeamId?: string | null;
      promptImages?: Array<{ mimeType: string; data: string; name: string; uri?: string }>;
      promptFiles?: Array<{ uri: string; name: string; mimeType: string; size?: number }>;
    },
  ) => {
    const docState = useDocumentStore.getState();
    const tabId = get().activeTabId;
    const projectPath = lastPathForSession(tabId) || docState.projectRoot || "";

    const tabBeforePrompt = get().tabs.find((t) => t.id === tabId);
    if (tabBeforePrompt?.legacyReadOnly) {
      set((state) => {
        const tabs = state.tabs.map((tab) => (
          tab.id === tabId
            ? { ...tab, error: "This imported OpenCode conversation is read-only." }
            : tab
        ));
        return { tabs, ...projectActiveTab(tabs, state.activeTabId) };
      });
      return;
    }
    const userBlocks = userContent?.length
      ? userContent
      : [{ type: "text" as const, text: userPrompt }];

    set((s) => {
      const tabs = s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        return {
          ...t,
          title: deriveSessionTitleForSend(t, userPrompt, userBlocks),
          isStreaming: true,
          streamGeneration: t.streamGeneration + 1,
          error: null,
          composerToolsSuppressed: skipUserMessage ? t.composerToolsSuppressed : false,
        };
      });
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });

    const tabAfterUser = get().tabs.find((t) => t.id === tabId);
    if (isAgentRuntime(tabAfterUser?.runtime)) {
      const turnId = newClientTurnId();
      get()._beginAgentTurn(tabId, turnId, userPrompt, userBlocks);
      try {
        const persistedSettings = useSettingsStore.getState().settings;
        const provider = persistedSettings.aiProvider || "anthropic";
        const model = persistedSettings.aiModel ?? undefined;
        const modelLabel = resolveTurnModelLabel(provider, model, persistedSettings);
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === tabId ? { ...t, pendingTurnMeta: { modelLabel } } : t,
          ),
        }));
        if (projectPath && isPendingNewWorktree(useWorktreeStore.getState())) {
          const info = await useWorktreeStore.getState().initializeWorktree(projectPath);
          await applyCheckoutTransition({ type: "worktree-existing", worktree: info });
        }
        if (parseRemoteAbs(projectPath)) {
          get()._setPreparePhase(tabId, "connecting_remote");
          await ensureRemoteLiveForWork(projectPath);
          get()._setPreparePhase(tabId, null);
        }
        const boundCheckoutPath =
          resolveWorktreePathForSend(get().tabs.find((t) => t.id === tabId), projectPath)
          ?? captureSessionCwd()
          ?? projectPath;
        const result = await agentDesktop.agentSend({
          conversationId: tabId,
          turnId,
          projectRoot: projectPath,
          boundCheckoutPath,
          text: userPrompt,
          tabId,
          sessionTeamId: composerExtras?.sessionTeamId ?? tabAfterUser?.sessionTeamId ?? undefined,
          provider,
          modelId: model,
          apiKey: persistedSettings.aiApiKeys?.[provider] || undefined,
          sessionAgent: tabAfterUser?.sessionAgent,
          mcpServerAllowlist: composerExtras?.mcpServerAllowlist,
          skillIds: composerExtras?.skillIds,
          images: composerExtras?.promptImages,
          promptFiles: composerExtras?.promptFiles,
          attachments: persistableAttachmentsFromUserBlocks(userBlocks),
        });
        if (!result.ok) {
          get()._applyAgentEvent(tabId, {
            type: "turn_failed",
            runtimeSessionId: tabId,
            tabId,
            turnId,
            error: formatAgentSendError(result.error),
          });
        } else {
          refreshAgentSessionList();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        get()._applyAgentEvent(tabId, {
          type: "turn_failed",
          runtimeSessionId: tabId,
          tabId,
          turnId,
          error: formatAgentSendError(message),
        });
      }
      return;
    }
    set((state) => {
      const tabs = state.tabs.map((tab) => (
        tab.id === tabId
          ? { ...tab, isStreaming: false, error: "Only the Pi Agent runtime can send messages." }
          : tab
      ));
      return { tabs, ...projectActiveTab(tabs, state.activeTabId) };
    });
  },

  openSubAgentPanel: (taskToolUseId) => {
    const id = taskToolUseId.trim();
    if (!id) return;
    const tabId = get().activeTabId;
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const conversation = ensureTaskRunFromTranscript(t.conversation, id);
        return {
          ...applyConversationToTab(t, conversation),
          openSubAgentPanelToolUseId: id,
        };
      }),
    }));
  },

  closeSubAgentPanel: () => {
    const tabId = get().activeTabId;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, openSubAgentPanelToolUseId: null } : t,
      ),
    }));
  },

  acknowledgeQuestionAnswer: (requestId, answer) => {
    const id = requestId.trim();
    if (!id) return;
    const tabId = get().activeTabId;
    set((s) => {
      const tabs = s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        return applyConversationToTab(
          t,
          applyQuestionAnswerToConversation(t.conversation, id, answer),
        );
      });
      return {
        tabs,
        ...projectActiveTab(tabs, s.activeTabId),
        streamTick: s.streamTick + 1,
      };
    });
  },

  cancelSubAgentRun: async (taskToolUseId) => {
    const tabId = get().activeTabId;
    const tab = get().tabs.find((t) => t.id === tabId);
    const run = tab?.subAgentRuns?.[taskToolUseId];
    if (!run || run.status !== "running") return;
    set((s) => {
      const tabs = s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        return applyConversationToTab(t, markSubagentStopping(t.conversation, taskToolUseId));
      });
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
    try {
      await agentDesktop.agentCancelSubagent({
        conversationId: tabId,
        toolCallId: taskToolUseId,
      });
    } catch (err) {
      console.error("[chat] Cancel subagent failed:", err);
    }
  },

  cancelExecution: async (conversationId?: string) => {
    const tabId = conversationId?.trim() || get().activeTabId;
    const tab = get().tabs.find((t) => t.id === tabId);
    const turnId = tab?.conversation.live?.turnId;
    try {
      await agentDesktop.agentCancel({ conversationId: tabId });
    } catch (err: any) {
      console.error("[chat] Cancel failed:", err);
    }
    if (turnId) {
      get()._applyAgentEvent(tabId, {
        type: "turn_cancelled",
        runtimeSessionId: tabId,
        tabId,
        turnId,
      });
    }
    set((s) => {
      const tabs = s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        return {
          ...t,
          isStreaming: t.conversation.live !== null ? t.isStreaming : false,
          streamGeneration: t.streamGeneration + 1,
        };
      });
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
  },

  _beginAgentTurn: (tabId, turnId, userText, userBlocks) => {
    set((state) => {
      const tabs = state.tabs.map((tab) => {
        if (tab.id !== tabId) return tab;
        const conversation = beginConversationTurn(tab.conversation, {
          turnId,
          userText,
          userBlocks,
        });
        return {
          ...applyConversationToTab(tab, conversation),
          error: null,
        };
      });
      return { tabs, ...projectActiveTab(tabs, state.activeTabId) };
    });
    // Live assistant blocks are owned by the stream store from here on;
    // text/thinking deltas bypass chat-store entirely (see _applyAgentEvent).
    useStreamStore.getState().beginTurn(tabId, turnId);
    pauseAutoCompileForAi(tabId);
    const started = get().tabs.find((tab) => tab.id === tabId);
    const turnIndex = started?.conversation.live?.turnIndex ?? 0;
    const sessionId = started?.conversation.conversationId || started?.sessionId || tabId;
    void import("../checkpoint-store").then(({ useCheckpointStore }) => {
      const checkpoints = useCheckpointStore.getState();
      if (sessionId && checkpoints.byTab[tabId]?.sessionId !== sessionId) {
        checkpoints.setSessionId(tabId, sessionId);
      }
      checkpoints.beginTurn(tabId, turnIndex);
    });
  },

  _applyAgentEvent: (tabId, event) => {
    // ── Streaming fast path ──
    // Text/thinking/tool-progress deltas land here at display rate. They only
    // shape the live turn's assistant blocks, so they bypass chat-store
    // completely: no tabs.map, no conversation rebuild, no subscriber churn.
    // The live turn renderer subscribes to stream-store instead.
    if (
      !event.subagent
      && (event.type === "text_delta"
        || event.type === "thinking_delta"
        || event.type === "tool_progress")
    ) {
      useStreamStore.getState().applyDelta(tabId, event);
      return;
    }

    set((state) => {
      const tabs = state.tabs.map((tab) => {
        if (tab.id !== tabId) return tab;
        // Map the main-process idle-timeout error code to a readable message
        // before it lands in the turn error block / tab error.
        const mapped =
          event.type === "turn_failed" && event.error
            ? { ...event, error: formatAgentSendError(event.error) }
            : event;
        // The stream store owns the live blocks between tool events.
        // Tool-lifecycle and terminal events must see the latest text before
        // the reducer applies on top (terminal events commit these blocks
        // into the turn record).
        const streamBlocks =
          tab.conversation.live && !event.subagent
            ? streamTabState(tabId).turnId === tab.conversation.live.turnId
              ? streamTabState(tabId).blocks
              : null
            : null;
        const conversationInput =
          streamBlocks && tab.conversation.live
            ? {
                ...tab.conversation,
                live: {
                  ...tab.conversation.live,
                  assistant: { blocks: streamBlocks },
                },
              }
            : tab.conversation;
        const conversation = applyConversationEvent(conversationInput, mapped);
        const suggest = conversation.pendingPlanSuggest;
        return {
          ...applyConversationToTab(tab, conversation),
          error: mapped.type === "turn_failed" ? mapped.error : tab.error,
          planSuggestVisible:
            !!suggest && tab.sessionAgent === "build" && !tab.planSuggestDismissed,
          planSuggestReason: suggest?.reason ?? null,
        };
      });
      return {
        tabs,
        ...projectActiveTab(tabs, state.activeTabId),
        streamTick: state.streamTick + 1,
      };
    });
    // Keep the stream store authoritative for the live turn: reducer output
    // wins on tool-lifecycle / subagent / terminal events.
    const tabAfterEvent = get().tabs.find((item) => item.id === tabId);
    const liveAfter = tabAfterEvent?.conversation.live;
    if (liveAfter && !event.subagent) {
      useStreamStore.getState().setBlocks(tabId, liveAfter.turnId, liveAfter.assistant.blocks);
    }
    if (
      event.type === "turn_finished"
      || event.type === "turn_failed"
      || event.type === "turn_cancelled"
    ) {
      useStreamStore.getState().endTurn(tabId);
    }
    if (event.type === "tool_finished" && event.ok) {
      const tab = get().tabs.find((item) => item.id === tabId);
      if (event.toolName === "literature-stage") {
        const sessionId = tab?.sessionId || tabId;
        captureLiteratureStageFromToolResult(sessionId, event.result);
      }
    }
    if (
      event.type === "turn_finished"
      || event.type === "turn_cancelled"
      || event.type === "turn_failed"
    ) {
      resumeAutoCompileAfterAi(tabId);
      void import("../checkpoint-store").then(({ useCheckpointStore }) => {
        void useCheckpointStore.getState().finalizeTurn(tabId, event.type === "turn_finished");
      });
      const tab = get().tabs.find((item) => item.id === tabId);
      const conversationId = tab?.conversation.conversationId || tab?.sessionId || tabId;
      const root = lastPathForSession(conversationId) || useDocumentStore.getState().projectRoot;
      void markSessionAutoUnreadIfBackground(root, conversationId, () =>
        isActiveSessionFromChatState(conversationId, get()),
      );
    }
    if (event.type === "turn_finished") {
      void maybeGenerateSessionTitle(tabId, get);
    }
  },

  _appendMessage: (tabId: string, msg: ChatStreamMessage) => {
    const stampedBox: {
      value: { sessionId: string | null; turnIndex: number; meta: TurnMessageMeta } | null;
    } = { value: null };
    set((s) => {
      const tabIdx = s.tabs.findIndex((t) => t.id === tabId);
      if (tabIdx === -1) return {};

      const tab = s.tabs[tabIdx];
      let msgs = tab.messages;
      let turnMeta = tab.turnMeta;
      let pendingTurnMeta = tab.pendingTurnMeta;

      // Commit streaming message before appending non-assistant event
      const finalized = finalizeStreamingForMutation(tab);
      if (finalized.messages.length > tab.messages.length) {
        msgs = finalized.messages;
      }

      // Attach completion meta when a result arrives right after assistant
      if (msg.type === "result" && !msg.is_error && (msg.duration_ms != null || msg.usage || tab.pendingTurnMeta)) {
        const parts: string[] = [];
        if (msg.duration_ms != null) {
          parts.push(`Completed in ${(msg.duration_ms / 1000).toFixed(1)}s`);
        }
        const usage = msg.usage;
        if (usage?.input_tokens || usage?.output_tokens) {
          const input = usage.input_tokens >= 1000
            ? `${(usage.input_tokens / 1000).toFixed(1)}k`
            : `${usage.input_tokens}`;
          const output = usage.output_tokens >= 1000
            ? `${(usage.output_tokens / 1000).toFixed(1)}k`
            : `${usage.output_tokens}`;
          parts.push(`↑${input} ↓${output}`);
        }
        const merged = mergeTurnMeta(tab, msgs, {
          summary: parts.length > 0 ? parts.join(" · ") : undefined,
        });
        turnMeta = merged.turnMeta;
        pendingTurnMeta = null;
        stampedBox.value = {
          sessionId: tab.sessionId,
          turnIndex: merged.turnIndex,
          meta: merged.meta,
        };
      }

      msgs = [...msgs, msg];

      let title = tab.title;
      if (
        isGenericSessionTitle(tab.title) &&
        msg.type === "user" &&
        !isToolResultUserMessage(msg)
      ) {
        const extracted = extractSessionTitle([msg]);
        if (extracted) title = extracted;
      }

      const newTabs = [...s.tabs];
      newTabs[tabIdx] = {
        ...tab,
        messages: msgs,
        turnMeta,
        pendingTurnMeta,
        streamingMessage: finalized.streamingMessage,
        title,
      };
      return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId) };
    });
    if (stampedBox.value) {
      persistTurnMetaToDisk(
        stampedBox.value.sessionId,
        stampedBox.value.turnIndex,
        stampedBox.value.meta,
      );
    }
  },

  _upsertLastMessage: (tabId: string, msg: ChatStreamMessage, messageId?: string) => {
    set((s) => {
      const tabIdx = s.tabs.findIndex((t) => t.id === tabId);
      if (tabIdx === -1) return {};

      const tab = s.tabs[tabIdx];
      const streamTick = ((s as any).streamTick || 0) + 1;
      const incomingMessageId = messageId?.trim() || null;

      // Late ACP replay of an already-committed OpenCode message — drop it.
      // Without this, a delayed tool/thought chunk tagged with an old messageId
      // commits the current turn and re-opens a streaming bubble of prior-turn
      // tools at the bottom of the latest turn (vanishes after hydrate/restart).
      if (incomingMessageId && tab.settledStreamMessageIds.includes(incomingMessageId)) {
        return {};
      }

      // New OpenCode assistant message — commit prior streaming turn first.
      let baseTab = tab;
      if (
        incomingMessageId
        && tab.streamingPartMessageId
        && incomingMessageId !== tab.streamingPartMessageId
        && tab.streamingMessage
      ) {
        baseTab = {
          ...tab,
          messages: [...tab.messages, tab.streamingMessage],
          streamingMessage: null,
          settledStreamMessageIds: withSettledStreamMessageId(tab, tab.streamingPartMessageId),
        };
      }

      const prev = baseTab.streamingMessage;
      const committedToolIds = collectCommittedToolUseIds(baseTab.messages);
      const incomingBlocks = msg.message?.content || [];
      const newBlocks = incomingBlocks.filter((b) => {
        if (b.type === "tool_use" && b.id && committedToolIds.has(b.id)) return false;
        return true;
      });
      // Entire update was a late replay of already-committed tool_use ids.
      if (incomingBlocks.length > 0 && newBlocks.length === 0) {
        return {};
      }
      const msgForMerge: ChatStreamMessage =
        newBlocks.length === incomingBlocks.length
          ? msg
          : { ...msg, message: { ...msg.message, content: newBlocks } };

      // No existing streaming message — set as first
      if (!prev) {
        const newTabs = [...s.tabs];
        newTabs[tabIdx] = {
          ...baseTab,
          streamingMessage: msgForMerge,
          streamingPartMessageId: incomingMessageId ?? baseTab.streamingPartMessageId,
        };
        return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId), streamTick };
      }

      const oldBlocks = prev.message?.content || [];

      const oldHasProgressThinking = oldBlocks.some(
        (b) => b.type === "thinking" && (b as ContentBlock)._progress
      );
      const newHasRealContent = newBlocks.some(
        (b) => (b.type === "text" || b.type === "thinking") && !(b as ContentBlock)._progress
      );

      // Mid-turn layout split (progress→real, or tool→text/think). Only settle
      // the prior messageId when OpenCode actually moved to a *different* id.
      // Settling the same id here drops subsequent thought deltas (common for
      // GLM-style streams that tool-call before/during reasoning).
      const settlePriorMessageId = (
        priorId: string | null | undefined,
        nextId: string | null,
      ): string[] => {
        if (priorId && nextId && priorId !== nextId) {
          return withSettledStreamMessageId(baseTab, priorId);
        }
        return baseTab.settledStreamMessageIds;
      };

      if (oldHasProgressThinking && newHasRealContent) {
        const nextId = incomingMessageId ?? baseTab.streamingPartMessageId;
        const newTabs = [...s.tabs];
        newTabs[tabIdx] = {
          ...baseTab,
          messages: [...baseTab.messages, prev],
          streamingMessage: msgForMerge,
          streamingPartMessageId: nextId,
          settledStreamMessageIds: settlePriorMessageId(
            baseTab.streamingPartMessageId,
            incomingMessageId,
          ),
        };
        return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId), streamTick };
      }

      const lastHasToolUse = oldBlocks.some((b) => b.type === "tool_use");
      const newIsTextOrThink = newBlocks.every((b) => b.type === "text" || b.type === "thinking");
      const settledToolResults = collectSettledToolResultIds([
        ...baseTab.messages,
        ...(baseTab.streamingMessage ? [baseTab.streamingMessage] : []),
      ]);
      const taskStillRunning = hasIncompleteTaskInBlocks(oldBlocks, settledToolResults);

      if (lastHasToolUse && newIsTextOrThink && !taskStillRunning) {
        const nextId = incomingMessageId ?? baseTab.streamingPartMessageId;
        const newTabs = [...s.tabs];
        newTabs[tabIdx] = {
          ...baseTab,
          messages: [...baseTab.messages, prev],
          streamingMessage: msgForMerge,
          streamingPartMessageId: nextId,
          settledStreamMessageIds: settlePriorMessageId(
            baseTab.streamingPartMessageId,
            incomingMessageId,
          ),
        };
        return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId), streamTick };
      }

      const newTypes = new Set(newBlocks.map((nb) => nb.type));
      const newToolIds = new Set(newBlocks.filter((nb) => nb.type === "tool_use" && nb.id).map((nb) => nb.id));
      const preserved = oldBlocks.filter((b) => {
        if (b.type === "text" && newTypes.has("text")) return false;
        if (b.type === "thinking" && newTypes.has("thinking")) return false;
        if (b.type === "tool_use" && b.id && newToolIds.has(b.id)) return false;
        return true;
      });

      const merged: ChatStreamMessage = {
        ...msgForMerge,
        message: { ...msgForMerge.message, content: [...preserved, ...newBlocks] },
      };

      const newTabs = [...s.tabs];
      newTabs[tabIdx] = {
        ...baseTab,
        streamingMessage: merged,
        streamingPartMessageId: incomingMessageId ?? baseTab.streamingPartMessageId,
      };
      return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId), streamTick };
    });
  },

  _setSessionCwd: (tabId: string, cwd: string | null) => {
    set((s) => {
      const tabs = s.tabs.map((t) => (t.id === tabId ? { ...t, sessionCwd: cwd } : t));
      return { tabs };
    });
  },

  _setSessionId: (tabId: string, sessionId: string) => {
    const sessionCwd = captureSessionCwd();
    const prior = get().tabs.find((t) => t.id === tabId);
    const intensivePaperIds = resolveIntensivePaperIdsForSession(
      sessionId,
      prior?.intensivePaperIds ?? [],
    );
    set((s) => {
      const tabs = s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, sessionId, sessionCwd: sessionCwd ?? t.sessionCwd, intensivePaperIds }
          : t,
      );
      const activeTab = tabs.find((t) => t.id === s.activeTabId);
      return { tabs, sessionId: activeTab?.sessionId ?? null };
    });
    persistAndSyncIntensiveReading(sessionId, intensivePaperIds);
    void import("../terminal-ai-store").then(({ useTerminalAiStore }) => {
      useTerminalAiStore.getState().migrateSessionMirrorLog(tabId, sessionId);
    });
    // Plan chrome needs a sessionId to claim/own the draft file.
    if (get().tabs.find((t) => t.id === tabId)?.sessionAgent === "plan") {
      void get().refreshPlanDraftFromDisk(tabId);
    }
  },

  _setTitle: (tabId: string, title: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
    }));
  },

  _markAutoTitleAttempted: (tabId: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, autoTitleAttempted: true } : t)),
    }));
  },

  _setPreparePhase: (tabId: string, phase: ChatPreparePhase | null) => {
    set((s) => {
      const tabs = s.tabs.map((t) =>
        t.id === tabId ? { ...t, preparePhase: phase } : t,
      );
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
  },

  _setAwaitingBackgroundJoin: (tabId, awaiting) => {
    set((s) => {
      const tabs = s.tabs.map((t) =>
        t.id === tabId ? { ...t, awaitingBackgroundJoin: awaiting } : t,
      );
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
  },

  _setStreaming: (tabId: string, isStreaming: boolean) => {
    const stampedBox: {
      value: { sessionId: string | null; turnIndex: number; meta: TurnMessageMeta } | null;
    } = { value: null };
    set((s) => {
      const tabs = s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        if (!isStreaming) {
          let messages = t.messages;
          let streamingMessage = t.streamingMessage;
          let streamingPartMessageId = t.streamingPartMessageId;
          let settledStreamMessageIds = t.settledStreamMessageIds;
          let turnMeta = t.turnMeta;
          let pendingTurnMeta = t.pendingTurnMeta;

          if (t.isStreaming && t.streamingMessage) {
            messages = [...t.messages, t.streamingMessage];
            streamingMessage = null;
            streamingPartMessageId = null;
            settledStreamMessageIds = withSettledStreamMessageId(t, t.streamingPartMessageId);
          } else if (t.streamingMessage) {
            streamingMessage = null;
            streamingPartMessageId = null;
          }

          // Ensure footer stamp even when no result event carried usage.
          if (pendingTurnMeta) {
            const merged = mergeTurnMeta(
              { turnMeta, pendingTurnMeta },
              messages,
              {},
            );
            turnMeta = merged.turnMeta;
            pendingTurnMeta = null;
            stampedBox.value = {
              sessionId: t.sessionId,
              turnIndex: merged.turnIndex,
              meta: merged.meta,
            };
          }

          return {
            ...t,
            isStreaming: false,
            awaitingBackgroundJoin: false,
            preparePhase: null,
            messages,
            streamingMessage,
            streamingPartMessageId,
            settledStreamMessageIds,
            turnMeta,
            pendingTurnMeta,
          };
        }
        return {
          ...t,
          isStreaming: true,
          streamGeneration: t.streamGeneration + 1,
        };
      });
      // Recalculate ALL projected fields via projectActiveTab so that
      // contextTokens picks up usage from the newly committed assistant message.
      const projected = projectActiveTab(tabs, s.activeTabId);
      if (projected.contextTokens === null && s.contextTokens !== null) {
        projected.contextTokens = s.contextTokens;
      }
      return { tabs, ...projected };
    });
    if (stampedBox.value) {
      persistTurnMetaToDisk(
        stampedBox.value.sessionId,
        stampedBox.value.turnIndex,
        stampedBox.value.meta,
      );
    }
    if (!isStreaming) {
      const tab = get().tabs.find((t) => t.id === tabId);
      cacheTabMessages(tab?.sessionId, tab?.messages ?? []);
    }
  },

  _setError: (tabId: string, error: string | null) => {
    set((s) => {
      const tabs = s.tabs.map((t) =>
        t.id === tabId ? { ...t, error } : t,
      );
      const activeTab = tabs.find((t) => t.id === s.activeTabId);
      return { tabs, error: activeTab?.error ?? null };
    });
  },

  _appendAssistantError: (tabId, text) => {
    const body = typeof text === "string" ? text.trim() : "";
    if (!body) return;
    set((s) => {
      const tabs = s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        let messages = t.messages;
        let settledStreamMessageIds = t.settledStreamMessageIds;
        if (t.streamingMessage) {
          const committed: ChatStreamMessage = {
            ...t.streamingMessage,
            stopped: true,
          };
          messages = [...messages, committed];
          settledStreamMessageIds = withSettledStreamMessageId(
            t,
            t.streamingPartMessageId,
          );
        }
        // session.error + chat:complete often fire with the same body — keep one bubble.
        const last = messages[messages.length - 1];
        const lastText =
          last?.turnError && last.type === "assistant"
            ? contentBlocksText(last)
            : "";
        if (lastText && lastText.trim() === body) {
          return {
            ...t,
            messages,
            streamingMessage: null,
            streamingPartMessageId: null,
            settledStreamMessageIds,
            isStreaming: false,
            preparePhase: null,
            error: null,
          };
        }
        const errorMsg: ChatStreamMessage = {
          type: "assistant",
          turnError: true,
          message: {
            content: [{ type: "text", text: body }],
          },
        };
        return {
          ...t,
          messages: [...messages, errorMsg],
          streamingMessage: null,
          streamingPartMessageId: null,
          settledStreamMessageIds,
          isStreaming: false,
          preparePhase: null,
          error: null,
        };
      });
      const activeTab = tabs.find((t) => t.id === s.activeTabId);
      return {
        tabs,
        ...projectActiveTab(tabs, s.activeTabId),
        error: activeTab?.error ?? null,
      };
    });
    const tab = get().tabs.find((t) => t.id === tabId);
    cacheTabMessages(tab?.sessionId, tab?.messages ?? []);
  },

  _setContextTokens: (tabId, tokens, opts) => {
    set((s) => {
      const clearAll = opts?.clear === true;
      const clearOccupancy = clearAll || opts?.clearOccupancy === true;
      // undefined / 0 tokens = don't clobber a known occupancy (e.g. usage without input).
      const nextTokens = clearOccupancy
        ? null
        : (tokens === undefined || tokens === 0 ? undefined : tokens);
      const nextSize =
        clearAll ? null : (opts && "windowSize" in opts ? opts.windowSize ?? null : undefined);
      const nextSource =
        clearOccupancy ? null : (opts && "source" in opts ? opts.source ?? null : undefined);
      const nextCost =
        clearAll ? null : (opts && "costUsd" in opts ? opts.costUsd ?? null : undefined);
      const nextBreakdown =
        clearOccupancy && !("breakdown" in (opts ?? {}))
          ? null
          : (opts && "breakdown" in opts ? opts.breakdown ?? null : undefined);

      const tabs = s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const next: typeof t = { ...t };
        if (nextTokens !== undefined) next.contextTokens = nextTokens;
        if (nextSize !== undefined) next.contextWindowSize = nextSize;
        if (nextSource !== undefined) next.contextUsageSource = nextSource;
        if (nextCost !== undefined) next.contextCostUsd = nextCost;
        if (nextBreakdown !== undefined) next.contextBreakdown = nextBreakdown;
        return next;
      });
      const isActive = s.activeTabId === tabId;
      if (isActive) {
        const active = tabs.find((t) => t.id === tabId);
        return {
          tabs,
          contextTokens: active?.contextTokens ?? null,
          contextWindowSize: active?.contextWindowSize ?? null,
          contextUsageSource: active?.contextUsageSource ?? null,
          contextCostUsd: active?.contextCostUsd ?? null,
          contextBreakdown: active?.contextBreakdown ?? null,
        };
      }
      return { tabs };
    });
  },

  _setPromptStale: (tabId: string, stale: boolean) => {
    set((s) => {
      const tabs = s.tabs.map((t) =>
        t.id === tabId ? { ...t, promptStale: stale } : t,
      );
      const isActive = s.activeTabId === tabId;
      if (isActive) {
        return { tabs, promptStale: stale };
      }
      return { tabs };
    });
  },

  /**
   * Patch the input of an existing tool_use block (in committed messages
   * or the streaming message) identified by its tool_use ID.
   *
   * Used when the initial ACP tool_call has empty rawInput (OpenCode sends
   * rawInput: {} during "pending" status) and the real parameters arrive
   * later via tool_call_update's _backfillInput payload.
   */
  _patchToolInput: (tabId: string, toolUseId: string, input: any, name?: string) => {
    set((s) => {
      const tabIdx = s.tabs.findIndex((t) => t.id === tabId);
      if (tabIdx === -1) return {};

      const tab = s.tabs[tabIdx];

      const patchBlock = (block: ContentBlock): ContentBlock => {
        if (block.type === "tool_use" && block.id === toolUseId) {
          const patched: ContentBlock = { ...block, input };
          if (name) patched.name = name;
          return patched;
        }
        return block;
      };

      // Patch tool_use blocks in committed messages
      const patchedMessages = tab.messages.map((msg) => {
        if (!msg.message?.content) return msg;
        return { ...msg, message: { ...msg.message, content: msg.message.content.map(patchBlock) } };
      });

      // Patch tool_use blocks in the streaming message (if still there)
      let patchedStreaming = tab.streamingMessage;
      if (patchedStreaming?.message?.content) {
        patchedStreaming = {
          ...patchedStreaming,
          message: { ...patchedStreaming.message, content: patchedStreaming.message.content.map(patchBlock) },
        };
      }

      const newTabs = [...s.tabs];
      newTabs[tabIdx] = { ...tab, messages: patchedMessages, streamingMessage: patchedStreaming };
      return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId) };
    });
  },

  _patchToolDuration: (
    tabId: string,
    toolUseId: string,
    duration: number,
    time?: { start?: number; end?: number },
  ) => {
    if (!Number.isFinite(duration) || duration < 0) return;
    set((s) => {
      const tabIdx = s.tabs.findIndex((t) => t.id === tabId);
      if (tabIdx === -1) return {};

      const tab = s.tabs[tabIdx];
      const patchBlock = (block: ContentBlock): ContentBlock => {
        if (block.type !== "tool_use" || block.id !== toolUseId) return block;
        return {
          ...block,
          duration,
          ...(typeof time?.start === "number" ? { timeStart: time.start } : {}),
          ...(typeof time?.end === "number" ? { timeEnd: time.end } : {}),
        };
      };

      const patchedMessages = tab.messages.map((msg) => {
        if (!msg.message?.content) return msg;
        return { ...msg, message: { ...msg.message, content: msg.message.content.map(patchBlock) } };
      });

      let patchedStreaming = tab.streamingMessage;
      if (patchedStreaming?.message?.content) {
        patchedStreaming = {
          ...patchedStreaming,
          message: {
            ...patchedStreaming.message,
            content: patchedStreaming.message.content.map(patchBlock),
          },
        };
      }

      const newTabs = [...s.tabs];
      newTabs[tabIdx] = { ...tab, messages: patchedMessages, streamingMessage: patchedStreaming };
      return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId) };
    });
  },

  _injectToolResult: (tabId: string, toolUseId: string, content: string, isError = true) => {
    set((s) => {
      const tabIdx = s.tabs.findIndex((t) => t.id === tabId);
      if (tabIdx === -1) return {};

      const tab = s.tabs[tabIdx];
      const block: ContentBlock = {
        type: "tool_result",
        tool_use_id: toolUseId,
        content,
        is_error: isError,
        status: isError ? "failed" : "completed",
      };

      const prior = tab.messages
        .flatMap((msg) => msg.message?.content ?? [])
        .find((b) => b.type === "tool_result" && b.tool_use_id === toolUseId);

      if (prior) {
        // Never downgrade a success to an error inject.
        if (!prior.is_error && isError) return {};
        // Same polarity already present — keep unless upgrading error → success.
        if (!!prior.is_error === !!isError && prior.is_error) {
          // Replace error body with newer error, or leave if identical path unused.
        }
        const patchedMessages = tab.messages.map((msg) => {
          if (!msg.message?.content?.some(
            (b) => b.type === "tool_result" && b.tool_use_id === toolUseId,
          )) {
            return msg;
          }
          return {
            ...msg,
            message: {
              ...msg.message,
              content: msg.message.content.map((b) =>
                b.type === "tool_result" && b.tool_use_id === toolUseId ? block : b,
              ),
            },
          };
        });
        const newTabs = [...s.tabs];
        newTabs[tabIdx] = { ...tab, messages: patchedMessages };
        return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId) };
      }

      let msgs = tab.messages;
      if (tab.streamingMessage) {
        msgs = [...msgs, tab.streamingMessage];
      }

      const newTabs = [...s.tabs];
      newTabs[tabIdx] = {
        ...tab,
        messages: [
          ...msgs,
          { type: "result", message: { content: [block] } },
        ],
        streamingMessage: null,
      };
      return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId) };
    });
  },

  _linkSubAgentRun: (tabId, taskToolUseId, data) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const prev = t.subAgentRuns[taskToolUseId];
        const nextExpert =
          data.expertId && data.expertId !== "expert"
            ? data.expertId
            : (prev?.expertId && prev.expertId !== "expert" ? prev.expertId : data.expertId);
        const nextSubSessionId = data.subSessionId ?? prev?.subSessionId;
        return {
          ...t,
          subAgentRuns: {
            ...t.subAgentRuns,
            [taskToolUseId]: {
              expertId: nextExpert || data.expertId || "general",
              prompt: data.prompt || prev?.prompt || "",
              mode: data.mode ?? prev?.mode,
              status: prev?.status === "done" || prev?.status === "error" ? prev.status : "running",
              subSessionId: nextSubSessionId,
              blocks: prev?.blocks ?? [],
              // Late link after UI degrade — clear the muted empty-stream hint.
              linkDegraded: nextSubSessionId ? false : prev?.linkDegraded,
              error: prev?.error,
            },
          },
        };
      }),
    }));
  },

  _startBackgroundSubAgentRun: (tabId, taskToolUseId, data) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const prev = t.subAgentRuns[taskToolUseId];
        if (prev?.status === "done" || prev?.status === "error") return t;
        const nextExpert =
          data.expertId && data.expertId !== "expert"
            ? data.expertId
            : (prev?.expertId && prev.expertId !== "expert" ? prev.expertId : data.expertId);
        return {
          ...t,
          subAgentRuns: {
            ...t.subAgentRuns,
            [taskToolUseId]: {
              expertId: nextExpert || data.expertId || "general",
              prompt: data.prompt || prev?.prompt || "",
              mode: "background",
              status: prev?.status === "stopping" ? "stopping" : "running",
              subSessionId: data.subSessionId ?? prev?.subSessionId,
              blocks: prev?.blocks ?? [],
              linkDegraded: data.subSessionId ? false : prev?.linkDegraded,
              error: prev?.error,
            },
          },
        };
      }),
    }));
  },

  _markSubAgentLinkDegraded: (tabId, taskToolUseId) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const prev = t.subAgentRuns[taskToolUseId];
        if (!prev || prev.status === "done" || prev.status === "error") return t;
        return {
          ...t,
          subAgentRuns: {
            ...t.subAgentRuns,
            [taskToolUseId]: {
              ...prev,
              linkDegraded: true,
            },
          },
        };
      }),
    }));
  },

  _upsertSubAgentActivity: (tabId, taskToolUseId, block) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const prev = t.subAgentRuns[taskToolUseId];
        // Activity can race ahead of subAgent.linked — create a stub run so the
        // panel isn't stuck on Working… with a discarded stream.
        const base = prev ?? {
          expertId: "expert",
          prompt: "",
          status: "running" as const,
          blocks: [] as ContentBlock[],
        };
        return {
          ...t,
          subAgentRuns: {
            ...t.subAgentRuns,
            [taskToolUseId]: {
              ...base,
              status: base.status === "done" || base.status === "error" ? base.status : "running",
              blocks: upsertSubAgentBlock(base.blocks, block),
            },
          },
        };
      }),
    }));
  },

  _setSubAgentSnapshot: (tabId, taskToolUseId, blocks) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const prev = t.subAgentRuns[taskToolUseId];
        const base = prev ?? {
          expertId: "expert",
          prompt: "",
          status: "running" as const,
          blocks: [] as ContentBlock[],
        };
        return {
          ...t,
          subAgentRuns: {
            ...t.subAgentRuns,
            [taskToolUseId]: {
              ...base,
              blocks: mergeSubAgentSnapshotBlocks(base.blocks, blocks),
            },
          },
        };
      }),
    }));
  },

  _hydrateSubAgentRun: (tabId, taskToolUseId, data) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const prev = t.subAgentRuns[taskToolUseId];
        // Prefer live non-empty blocks over a late empty hydrate.
        if (prev?.blocks.length && data.blocks.length === 0) return t;
        const blocks = mergeSubAgentSnapshotBlocks(prev?.blocks ?? [], data.blocks);
        const status =
          prev?.status === "done"
          || prev?.status === "error"
          || prev?.status === "stopping"
            ? prev.status
            : data.status;
        return {
          ...t,
          subAgentRuns: {
            ...t.subAgentRuns,
            [taskToolUseId]: {
              expertId: data.expertId || prev?.expertId || "general",
              prompt: data.prompt || prev?.prompt || "",
              status,
              subSessionId: data.subSessionId || prev?.subSessionId,
              blocks,
              linkDegraded: data.subSessionId ? false : prev?.linkDegraded,
              error: status === "error" ? (data.error || prev?.error) : undefined,
            },
          },
        };
      }),
    }));
  },

  _completeSubAgentRun: (tabId, taskToolUseId, status, error) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const prev = t.subAgentRuns[taskToolUseId];
        if (!prev) return t;
        const next: SubAgentRun = {
          ...prev,
          status,
          linkDegraded: status === "done" ? prev.linkDegraded : prev.linkDegraded,
        };
        if (status === "done") {
          delete next.error;
        } else if (typeof error === "string" && error.trim()) {
          next.error = error.trim();
        }
        return {
          ...t,
          subAgentRuns: {
            ...t.subAgentRuns,
            [taskToolUseId]: next,
          },
        };
      }),
    }));
  },

});

async function maybeGenerateSessionTitle(
  tabId: string,
  getState: () => ChatState,
): Promise<void> {
  const tab = getState().tabs.find((item) => item.id === tabId);
  if (!tab) return;
  const excerpts = firstCompletedTurnExcerpts(tab.conversation);
  if (!shouldRequestGeneratedSessionTitle({
    userTitleSet: tab.userTitleSet,
    autoTitleAttempted: tab.autoTitleAttempted,
    completedUserTurns: countCompletedContentTurns(tab.conversation),
    firstUserExcerpt: excerpts?.user,
  })) return;

  getState()._markAutoTitleAttempted(tabId);
  try {
    const result = await agentDesktop.agentGenerateSessionTitle({
      conversationId: resolveProductConversationId(tab),
      userText: excerpts?.user,
      assistantText: excerpts?.assistant,
    });
    if (!result.ok || !result.title || result.skipped) return;
    const latest = getState().tabs.find((item) => item.id === tabId);
    if (!latest || latest.userTitleSet) return;
    getState()._setTitle(tabId, result.title);
    refreshAgentSessionList();
  } catch {
    /* keep the first-message title */
  }
}

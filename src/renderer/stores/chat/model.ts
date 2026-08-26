/** Chat store model: types, helpers, initial data. Not a zustand store. */
import { toast } from "sonner";
import { i18n } from "@/lib/i18n";
import type { ComposerPart } from "@/lib/chat/composer-parts";
import type { ChatStreamMessage, ContentBlock } from "@/lib/chat/types";
import { agentDesktop } from "@/lib/desktop-api/agent";
import { researchDesktop } from "@/lib/desktop-api/research";
import type {
  Conversation,
  TurnMessageMeta,
} from "../../../shared/agent/conversation";
import { emptyConversation, newConversationId } from "../../../shared/agent/conversation";
import type { AgentEvent } from "../../../shared/agent/runtime";
import type { ContextUsageBreakdown } from "../../../shared/agent/context-usage";
import {
  acknowledgeQuestionAnswer as applyQuestionAnswerToConversation,
  appendAssistantBlocksToLastTurn,
  applyConversationEvent,
  beginConversationTurn,
  ensureTaskRunFromTranscript,
  markSubagentStopping,
} from "@/lib/chat/conversation-reducer";
import type { ConversationSubagentRun } from "../../../shared/agent/conversation";
import {
  combineComposerQueueItems,
  type ComposerQueueItem,
} from "@/lib/chat/composer-send-queue";
import { useDocumentStore } from "../document-store";
import { lastPathForSession, sameProjectPath, useWorkbenchStore } from "../workbench-store";
import { applyCheckoutTransition, attachWorktreeForSessionDirectory, captureSessionCwd, isPendingNewWorktree, isWorktreeCheckoutPath, resolveWorktreePathForSend } from "@/lib/git/checkout-context";
import { useWorktreeStore } from "../worktree-store";
import { useSettingsStore } from "../settings-store";
import { truncateChatMessagesToTurn, isToolResultUserMessage, countUserTurns } from "@/lib/chat/chat-turns";
import { reconcileBackgroundSubAgentRunsFromMessages } from "@/lib/chat/reconcile-background-tasks";
import {
  planArtifactCardFromEvents,
} from "@/lib/chat/plan-ui-events";
import { clearTurnWindowState } from "@/lib/chat/turn-window";
import { dismissTodoPlan as persistTodoPlanDismiss } from "@/lib/chat/composer-pending-tools";
import { conversationHasContent } from "@/lib/chat/conversation-view";
import {
  deriveSessionTitleForSend,
  extractSessionTitle,
  isGenericSessionTitle,
  pruneDisposableEmptyChatTabs,
} from "@/lib/chat/session-title";
import { resolveTurnModelLabel } from "@/lib/chat/turn-model-label";
import {
  persistAndSyncIntensiveReading,
  resolveIntensivePaperIdsForSession,
} from "@/lib/literature/sync-intensive-reading";
import {
  captureLiteratureStageFromToolResult,
  scheduleCitationStagingBackfillFromConversation,
} from "@/lib/literature/sync-citation-staging-from-messages";
import { useCitationStagingStore } from "../citation-staging-store";
import type { ChatPreparePhase } from "../../../shared/chat/prepare-phases";
import type { SessionAgent } from "../../../shared/agent/session-agent";
import {
  isAgentRuntime,
  type ChatRuntimeKind,
} from "../../../shared/agent/api";
import type { ResearchPlanStep } from "../../../shared/research/plan";
import {
  buildApprovedPlanExecutePrompt,
  checklistToTodoSeeds,
  parsePlanChecklist,
  draftPlanPathBelongsToSession,
  isResearchPlanDraftPath,
  PLAN_REJECT_ACK_PROMPT,
  extractPlanFrontmatterDescription,
  sessionDraftPlanRel,
} from "../../../shared/research/plan";

export function formatAgentSendError(reason?: string): string {
  if (!reason) return i18n.t("agentLab.sendFailed");
  if (reason === "agent_not_on_remote_yet") return i18n.t("remote.agentNotReady");
  if (reason === "entitlement") return i18n.t("remote.agentEntitlement");
  if (reason === "missing_local_key") return i18n.t("remote.missingLocalKey");
  if (reason === "host_model_unconfigured") return i18n.t("remote.hostModelUnconfigured");
  if (reason.startsWith("missing_host_api_key")) {
    const provider = reason.slice("missing_host_api_key:".length).trim() || "this model";
    return i18n.t("remote.missingHostApiKey", { provider });
  }
  if (reason === "remote_attachment_not_uploaded") return i18n.t("remote.attachmentNotUploaded");
  if (reason === "remote_attachment_too_large") return i18n.t("remote.attachmentTooLarge");
  if (reason === "remote_module_pending") return i18n.t("remote.modulePending");
  if (reason === "turn_idle_timeout") return i18n.t("chat.errors.turn_timeout");
  if (reason === "terminated" || reason === "aborted") {
    return i18n.t("chat.errors.turn_aborted");
  }
  if (reason.startsWith("unsupported_pi_provider")) {
    return i18n.t("agentLab.reason.unsupportedProvider");
  }
  const key = `agentLab.reason.${reason}`;
  const translated = i18n.t(key);
  if (translated !== key) return translated;
  // Internal codes like turn_in_progress must not land in the transcript.
  if (/^[a-z][a-z0-9_]*$/.test(reason)) return i18n.t("agentLab.sendFailed");
  return reason;
}

export function newClientTurnId(): string {
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Types ───

export type { TurnMessageMeta };
export type { ChatStreamMessage, ContentBlock };

export interface TabDraft {
  /** JSON draft (`draftToJson`) or legacy plain text */
  input: string;
  /** Structured inline composer parts (preferred) */
  parts?: ComposerPart[];
  /** @deprecated legacy command chips */
  chips?: { id: string; commandName: string; action?: string; source: string }[];
}

export interface TabState {
  id: string;
  title: string;
  /** True once the user has explicitly renamed this tab. Blocks OpenCode auto-overwrite
   *  in left-sidebar's fetchSessions sync so user-set titles stick. */
  userTitleSet: boolean;
  /** First-turn auto title already tried (success or fail). */
  autoTitleAttempted?: boolean;
  sessionId: string | null;
  /** Default Pi. OpenCode only when opening an old history session. */
  runtime: ChatRuntimeKind;
  /** Imported OpenCode sessions are view-only and can never resume that backend. */
  legacyReadOnly: boolean;
  /** Runtime-agnostic source of truth for Pi conversation turns. */
  conversation: Conversation;
  /**
   * @deprecated OpenCode stream rows. Formal chat reads `conversation` only.
   * Kept for leftover tests / checkpoint undo. Do not write on the Pi send path.
   */
  messages: ChatStreamMessage[];
  /** @deprecated See `messages`. Formal streaming state is `conversation.live`. */
  streamingMessage: ChatStreamMessage | null;
  /** @deprecated OpenCode assistant message id. Unused on the Pi path. */
  streamingPartMessageId: string | null;
  /**
   * OpenCode messageIds already committed for this tab. Late ACP replays of
   * those ids must not re-enter `streamingMessage` (otherwise prior-turn tools /
   * thoughts append under the latest turn until restart/hydrate).
   */
  settledStreamMessageIds: string[];
  isStreaming: boolean;
  /**
   * Monotonic per tab. Bumped when a turn starts streaming or is cancelled.
   * Stale `chat:complete` / idle backups must not clear a newer generation.
   */
  streamGeneration: number;
  /**
   * Parent end_turn while background Tasks still joining / OpenCode may
   * auto-resume. Keep the turn alive; ignore session-idle streaming backup.
   */
  awaitingBackgroundJoin: boolean;
  error: string | null;
  draft: TabDraft;
  /** Turn index → footer meta (time, model, optional summary). */
  turnMeta: Record<number, TurnMessageMeta>;
  /** Model label for the in-flight turn — stamped onto turnMeta on complete. */
  pendingTurnMeta: { modelLabel: string } | null;
  /** Per-tab context token total. Source of truth for the context ring.
   *  Set by _setContextTokens (live) or restored from the Pi session record. */
  contextTokens: number | null;
  /** Pi model context window when known; else null (UI falls back to catalog). */
  contextWindowSize: number | null;
  /** How contextTokens was derived. */
  contextUsageSource: "usage_update" | "prompt_usage" | "estimate" | null;
  /** Cumulative session spend in USD from Pi usage totals. */
  contextCostUsd: number | null;
  /** Estimated prompt buckets fitted to occupancy (Cursor-style legend). */
  contextBreakdown: ContextUsageBreakdown | null;
  /** True when live prompt config differs from this session's injected fingerprint. */
  promptStale: boolean;
  /** Expert team orchestrator id (null → project default). */
  orchestratorId: string | null;
  /** Tab-level active team override (null → project/app default via Teams resolver). */
  sessionTeamId: string | null;
  /** OpenCode primary agent for this tab. */
  sessionAgent: SessionAgent;
  /** True while session history is being loaded from disk (avoids homepage flash). */
  isLoadingSession: boolean;
  /** OpenCode session directory — worktree path or project root. */
  sessionCwd: string | null;
  /** Papers in intensive reading mode for this tab. Each send prompts the agent
   *  to use literature-read-pdf on these bibkeys. Managed separately from @ chips:
   *  removing a paper here does NOT remove the @ chip in the composer. */
  intensivePaperIds: string[];
  /** Live activity for OpenCode Task / subagent runs keyed by parent task tool_use id. */
  subAgentRuns: Record<string, SubAgentRun>;
  /**
   * OpenCode Task tool_use id whose subagent run panel is open above the composer
   * (null = closed). Panel chat and AiBar both read this.
   */
  openSubAgentPanelToolUseId: string | null;
  /**
   * First-turn preparation stage from main (`system.prepare`) while there is
   * still no assistant content — shown instead of a bare "Thinking…".
   */
  preparePhase: ChatPreparePhase | null;
  /** Show L2 "enter Plan mode?" suggest bar (Build only). */
  planSuggestVisible: boolean;
  /** User dismissed suggest for this tab — suppress until reset. */
  planSuggestDismissed: boolean;
  /** Optional body from suggest-plan tool `reason` (falls back to i18n). */
  planSuggestReason: string | null;
  /** Consent window end (Date.now() ms); null when not awaiting. */
  planSuggestDeadlineAt: number | null;
  /** Session id for tool-bridge resolve. */
  planSuggestConsentSessionId: string | null;
  /** Live plan steps from plan.updated events while in Plan mode (UI checklist only). */
  planDraftSteps: ResearchPlanStep[];
  planDraftTitle: string | null;
  /** Frontmatter `description` for the Plan confirm panel. */
  planDraftSummary: string | null;
  /**
   * Created Plan card metadata (rendered inline after write/edit tool).
   * Not a stream message — survives via session plan events.
   */
  planArtifactCard: {
    path: string;
    title?: string;
    discarded: boolean;
  } | null;
  /** Non-empty session draft on disk — soft-block Build exit + enable Approve. */
  planDraftDirty: boolean;
  /** Disk draft is present and non-empty. */
  planDraftFileReady: boolean;
  /**
   * When true, hide composer "Plan ready for confirmation" (e.g. after session restore).
   * Approve/Deny still available on RightArea draft toolbar.
   */
  planConfirmSuppressed: boolean;
  /**
   * When true, hide composer Question chrome — set on session cold-load
   * (tab reopen / history hydrate). Cleared on user send or live agent streaming.
   * TodoWrite lives under the user message bubble and ignores this flag.
   */
  composerToolsSuppressed: boolean;
  /**
   * Messages queued while a turn is in flight. Ephemeral (not session-persisted).
   * After idle (natural end or Stop): send pendingFlush first (if any), then sequential dequeue.
   */
  composerSendQueue: import("@/lib/chat/composer-send-queue").ComposerQueueItem[];
  /**
   * Next payload to send once idle. Set by empty-Enter flush (combine all) or row send-one.
   * Empty Enter / send-one while streaming also cancel the current turn first.
   */
  composerQueuePendingFlush: import("@/lib/chat/composer-send-queue").ComposerQueueItem | null;
  /** Soft-block dialog when leaving Plan with a dirty draft. */
  planExitDialogOpen: boolean;
}

export interface SubAgentRun {
  expertId: string;
  prompt: string;
  /** Sync (default) blocks parent Task tool; background continues after early start. */
  mode?: "sync" | "background";
  /** `stopping` = user Stop intent; settle to error/done only when parent Task finishes. */
  status: "running" | "stopping" | "done" | "error";
  subSessionId?: string;
  blocks: ContentBlock[];
  /** Real Task failure (OpenCode/ACP) — not link degrade. */
  error?: string;
  /** Child session never linked in time; Task may still complete via OpenCode. */
  linkDegraded?: boolean;
}

export function makeDefaultTab(id: string): TabState {
  return {
    id,
    title: "New Chat",
    userTitleSet: false,
    autoTitleAttempted: false,
    sessionId: id,
    runtime: "pi",
    legacyReadOnly: false,
    conversation: emptyConversation({ conversationId: id }),
    messages: [],
    streamingMessage: null,
    streamingPartMessageId: null,
    settledStreamMessageIds: [],
    isStreaming: false,
    streamGeneration: 0,
    awaitingBackgroundJoin: false,
    error: null,
    draft: { input: "" },
    turnMeta: {},
    pendingTurnMeta: null,
    contextTokens: null,
    contextWindowSize: null,
    contextUsageSource: null,
    contextCostUsd: null,
    contextBreakdown: null,
    promptStale: false,
    orchestratorId: null,
    sessionTeamId: null,
    sessionAgent: "build",
    isLoadingSession: false,
    sessionCwd: null,
    intensivePaperIds: [],
    subAgentRuns: {},
    openSubAgentPanelToolUseId: null,
    preparePhase: null,
    planSuggestVisible: false,
    planSuggestDismissed: false,
    planSuggestReason: null,
    planSuggestDeadlineAt: null,
    planSuggestConsentSessionId: null,
    planDraftSteps: [],
    planDraftTitle: null,
    planDraftSummary: null,
    planArtifactCard: null,
    planDraftDirty: false,
    planDraftFileReady: false,
    planConfirmSuppressed: false,
    composerToolsSuppressed: false,
    composerSendQueue: [],
    composerQueuePendingFlush: null,
    planExitDialogOpen: false,
  };
}

/** Return a new lastTitleByTab map with the entry for `tabId` removed. */
export function dropTitle(map: Record<string, string>, tabId: string): Record<string, string> {
  if (!(tabId in map)) return map;
  const { [tabId]: _drop, ...rest } = map;
  return rest;
}

export function withSettledStreamMessageId(tab: TabState, messageId: string | null | undefined): string[] {
  const id = messageId?.trim();
  if (!id || tab.settledStreamMessageIds.includes(id)) return tab.settledStreamMessageIds;
  return [...tab.settledStreamMessageIds, id];
}

export function contentBlocksText(msg: ChatStreamMessage): string {
  const blocks = msg.message?.content;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b): b is ContentBlock & { type: "text"; text: string } =>
      b.type === "text" && typeof b.text === "string",
    )
    .map((b) => b.text)
    .join("\n");
}

export function conversationKey(tab: Pick<TabState, "id" | "sessionId" | "conversation">): string {
  return tab.conversation.conversationId || tab.id || tab.sessionId || "";
}

/** Drop stale draft buffers/tabs after Approve (rename) or Deny (delete). */
export function evictPlanDraftFromEditor(sessionId: string | null | undefined): void {
  const sid = sessionId?.trim() || "";
  const sessionDraftRel = sid ? sessionDraftPlanRel(sid) : "";

  const shouldEvict = (path: string): boolean => {
    if (!isResearchPlanDraftPath(path)) return false;
    if (!sid) return true;
    if (draftPlanPathBelongsToSession(path, sid)) return true;
    if (sessionDraftRel && (path === sessionDraftRel || path.endsWith(`/${sessionDraftRel}`))) {
      return true;
    }
    // Legacy current-draft.md — ownership was stamped for this session; safe to clear.
    return !path.includes("/drafts/");
  };

  const doc = useDocumentStore.getState();
  const opened = new Map(doc.openedContents);
  let changed = false;
  let nextActive = doc.activeFileId;
  for (const key of [...opened.keys()]) {
    if (!shouldEvict(key)) continue;
    opened.delete(key);
    changed = true;
    if (nextActive === key) nextActive = null;
  }
  if (changed) {
    useDocumentStore.setState({
      openedContents: opened,
      activeFileId: nextActive,
    });
  }

  void import("@/stores/right-panel-store").then(({ useRightPanelStore }) => {
    const rps = useRightPanelStore.getState();
    for (const t of rps.tabs) {
      if (t.kind !== "file" && t.kind !== "research-plan") continue;
      const path = t.filePath || t.fileId || "";
      if (shouldEvict(path)) rps.closeTab(t.id);
    }
  });
}

export function collectCommittedToolUseIds(messages: ChatStreamMessage[]): Set<string> {
  const ids = new Set<string>();
  for (const msg of messages) {
    for (const block of msg.message?.content || []) {
      if (block.type === "tool_use" && typeof block.id === "string" && block.id) {
        ids.add(block.id);
      }
    }
  }
  return ids;
}

export function collectSettledToolResultIds(messages: ChatStreamMessage[]): Set<string> {
  const ids = new Set<string>();
  for (const msg of messages) {
    for (const block of msg.message?.content || []) {
      if (block.type === "tool_result" && block.tool_use_id) {
        ids.add(block.tool_use_id);
      }
    }
  }
  return ids;
}

export function hasIncompleteTaskInBlocks(
  blocks: ContentBlock[],
  settledToolResultIds: Set<string>,
): boolean {
  return blocks.some(
    (b) =>
      b.type === "tool_use"
      && (b.name || "").toLowerCase() === "task"
      && !!b.id
      && !settledToolResultIds.has(b.id),
  );
}

/** Session history cache — LRU-capped so long chats cannot grow forever (Bug #23). */
export const MSG_CACHE_MAX = 48;
export const _msgCache = new Map<string, ChatStreamMessage[]>();

export function msgCacheGet(sessionId: string): ChatStreamMessage[] | undefined {
  const hit = _msgCache.get(sessionId);
  if (!hit) return undefined;
  _msgCache.delete(sessionId);
  _msgCache.set(sessionId, hit);
  return hit;
}

export function msgCacheSet(sessionId: string, messages: ChatStreamMessage[]): void {
  if (_msgCache.has(sessionId)) _msgCache.delete(sessionId);
  _msgCache.set(sessionId, messages);
  while (_msgCache.size > MSG_CACHE_MAX) {
    const oldest = _msgCache.keys().next().value;
    if (oldest === undefined) break;
    _msgCache.delete(oldest);
  }
}

/** Keep reopen-cache aligned with the live tab (Approve/Deny + Build turns). */
export function cacheTabMessages(
  sessionId: string | null | undefined,
  messages: ChatStreamMessage[],
): void {
  if (!sessionId?.trim()) return;
  msgCacheSet(sessionId, messages);
}

/** @internal — exercise LRU via the same path as production. */
export function _msgCacheSetForTests(sessionId: string, messages: ChatStreamMessage[]): void {
  msgCacheSet(sessionId, messages);
}

/** @internal */
export function _msgCacheGetForTests(sessionId: string): ChatStreamMessage[] | undefined {
  return msgCacheGet(sessionId);
}

/** @internal */
export function _msgCacheMaxForTests(): number {
  return MSG_CACHE_MAX;
}

export function syncCheckoutForTab(tab: Pick<TabState, "sessionCwd"> | undefined): void {
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot) return;

  const cwd = tab?.sessionCwd;
  if (cwd && cwd !== projectRoot && isWorktreeCheckoutPath(cwd, projectRoot)) {
    void attachWorktreeForSessionDirectory(cwd);
    return;
  }

  void applyCheckoutTransition({ type: "local" });
}

export interface ChatState {

  // Multi-tab state
  tabs: TabState[];
  activeTabId: string;
  /** Per-tab single-step undo buffer for session rename. Keyed by tabId.
   *  Cleared on closeTab or on successful undoRenameSession. */
  lastTitleByTab: Record<string, string>;

  // Projected fields (from active tab) — for backward compat
  messages: ChatStreamMessage[];
  streamingMessage: ChatStreamMessage | null;
  turnMeta: Record<number, TurnMessageMeta>;
  sessionId: string | null;
  isStreaming: boolean;
  error: string | null;
  /** Current context window occupancy from Pi — null = unknown */
  contextTokens: number | null;
  /** Pi-reported context window size; null → fall back to model catalog */
  contextWindowSize: number | null;
  contextUsageSource: "usage_update" | "prompt_usage" | "estimate" | null;
  /** Cumulative session spend in USD from Pi usage totals. */
  contextCostUsd: number | null;
  contextBreakdown: ContextUsageBreakdown | null;
  /** True when prompt/rules changed since this session's system prompt was set. */
  promptStale: boolean;
  /** True while the active tab is loading session history from disk. */
  isLoadingSession: boolean;
  /** Debug: incremented on every _upsertLastMessage call to verify re-renders */
  streamTick: number;
  /** Bumped when the user dismisses a message-anchored TodoWrite drawer (UI only). */
  todoPlanDismissEpoch: number;
  /** Persist dismiss + bump epoch so the drawer unmounts without affecting execution. */
  dismissTodoPlan: (toolUseId: string) => void;
  /** Active tab first-turn prepare phase (projected). */
  preparePhase: ChatPreparePhase | null;

  // Tab management
  createTab: (opts?: { runtime?: ChatRuntimeKind }) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  moveTab: (fromIndex: number, toIndex: number) => void;
  /** Rename the session for a tab. Persists via session:rename IPC when the tab
   *  has a sessionId; otherwise updates only the local title. Sets userTitleSet:true
   *  and records the previous title in lastTitleByTab so Cmd+Z can undo. */
  renameSession: (tabId: string, title: string) => Promise<void>;
  /** Restore the previous title recorded by renameSession. No-op if no buffer
   *  entry exists. Clears the buffer on successful restore. */
  undoRenameSession: (tabId: string) => Promise<void>;
  saveDraft: (tabId: string, draft: TabDraft) => void;

  // Intensive reading list (per-tab)
  /** Add a paper to this tab's intensive reading list (idempotent). */
  addIntensivePaper: (tabId: string, paperId: string) => void;
  /** Remove a paper from this tab's intensive reading list (leaves @ chips alone). */
  removeIntensivePaper: (tabId: string, paperId: string) => void;
  /** Clear all intensive papers for this tab (list empty = intensive mode off). */
  clearIntensivePapers: (tabId: string) => void;

  /** Set OpenCode primary agent for a tab (defaults to active tab). */
  setSessionAgent: (agent: SessionAgent, tabId?: string) => void;
  /** Soft-block entry when leaving Plan with a dirty draft. */
  requestSetSessionAgent: (agent: SessionAgent, tabId?: string) => void;
  /** Tab-level active team (Teams v2); null clears override. */
  setSessionTeamId: (tabId: string, teamId: string | null) => void;
  /** Clear all tab sessionTeamId overrides (Settings changed project default). */
  clearSessionTeamOverrides: () => void;
  /**
   * After reopening a session with a pending draft: restore Plan agent + chip +
   * permissions, but suppress the composer confirm strip (Approve lives on draft toolbar).
   */
  restorePendingPlanModeIfNeeded: (tabId?: string) => Promise<boolean>;

  // Plan workflow (per-tab)
  showPlanSuggest: (
    tabId?: string,
    reason?: string | null,
    opts?: { deadlineAt?: number; sessionId?: string | null },
  ) => void;
  dismissPlanSuggest: (tabId?: string) => void;
  acceptPlanSuggest: (tabId?: string) => void;
  /** Timeout path — same as dismiss for Plan entry; flushes deferred send. */
  timeoutPlanSuggest: (tabId?: string) => void;
  /** Shared accept / dismiss / timeout resolver. */
  finishPlanSuggestConsent: (
    decision: "accepted" | "dismissed" | "timed_out",
    tabId?: string,
  ) => Promise<void>;
  setPlanDraftFromEvent: (steps: ResearchPlanStep[], title?: string | null, tabId?: string) => void;
  clearPlanDraft: (tabId?: string) => void;
  /** Re-read this session's plan draft and update ready/dirty flags. */
  refreshPlanDraftFromDisk: (tabId?: string) => Promise<boolean>;
  /** Ensure a clickable plan card exists in the message stream for this draft. */
  ensurePlanArtifactCard: (
    tabId: string,
    args: { title?: string | null; path: string },
  ) => void;
  openPlanDraftInEditor: () => Promise<void>;
  /** Open a plan markdown path in RightArea (draft or approved). */
  openPlanFileInEditor: (relativePath: string) => Promise<void>;
  openPlanExitDialog: (tabId?: string) => void;
  closePlanExitDialog: (tabId?: string) => void;
  approveAndExecutePlan: (tabId?: string) => Promise<void>;
  exitPlanDiscardAndBuild: (tabId?: string) => Promise<void>;

  // Chat actions
  sendPrompt: (
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
  ) => Promise<void>;
  cancelExecution: (conversationId?: string) => Promise<void>;
  enqueueComposerSend: (
    tabId: string,
    item: ComposerQueueItem,
  ) => void;
  removeComposerSend: (tabId: string, itemId: string) => void;
  /** Move an item to the front of the queue. */
  prioritizeComposerSend: (tabId: string, itemId: string) => void;
  /** Empty Enter: combine entire queue into pendingFlush and clear the list. */
  commitComposerQueueFlush: (tabId: string) => void;
  /**
   * Row send-one: pull one item into pendingFlush (remaining stay queued).
   * Caller cancels the in-flight turn when streaming.
   */
  promoteComposerSendToPendingFlush: (tabId: string, itemId: string) => void;
  clearComposerSendQueue: (tabId: string) => void;
  takeComposerSendQueueHead: (tabId: string) => ComposerQueueItem | null;
  takeComposerSendQueueCombined: (tabId: string) => ComposerQueueItem | null;
  takeComposerQueuePendingFlush: (tabId: string) => ComposerQueueItem | null;
  /** Open the overlay subagent run panel for a Task tool_use. */
  openSubAgentPanel: (taskToolUseId: string) => void;
  closeSubAgentPanel: () => void;
  /** User submitted a question answer — drop chrome immediately. */
  acknowledgeQuestionAnswer: (requestId: string, answer: string) => void;
  /** Stop a running subagent; abort its session and inject a Task tool_result for the main agent. */
  cancelSubAgentRun: (taskToolUseId: string) => Promise<void>;
  newSession: () => void;
  newPiSession: () => void;
  clearAllSessions: () => void;
  clearCurrentTab: () => void;
  loadSession: (sessionId: string, sessionDirectory?: string, projectLastPath?: string) => Promise<void>;
  /** Re-check prompt fingerprint vs session for one tab (after settings edits). */
  checkPromptStale: (tabId?: string) => Promise<void>;
  /** Truncate in-memory Conversation (and leftover messages) to a turn. */
  truncateToTurn: (tabId: string, turnIndex: number) => void;
  /** Restore Conversation after undoing a rollback when the engine leaf is gone. */
  restoreConversation: (tabId: string, conversation: Conversation) => void;
  applyConversationCompact: (
    tabId: string,
    compacted: { throughTurnIndex: number; summary?: string },
  ) => void;
  /** @deprecated Prefer restoreConversation. Kept for leftover regret snapshots. */
  restoreMessages: (tabId: string, messages: ChatStreamMessage[]) => void;
  /** Reload sanitized messages from disk after OpenCode session truncation. */
  resyncTabMessagesFromDisk: (tabId: string) => Promise<void>;

  // Internal tab mutation helpers (Conversation / Agent events)
  _beginAgentTurn: (tabId: string, turnId: string, userText: string, userBlocks?: ContentBlock[]) => void;
  _applyAgentEvent: (tabId: string, event: AgentEvent) => void;
  _appendMessage: (tabId: string, msg: ChatStreamMessage) => void;
  _upsertLastMessage: (tabId: string, msg: ChatStreamMessage, messageId?: string) => void;
  _setSessionId: (tabId: string, id: string) => void;
  _setSessionCwd: (tabId: string, cwd: string | null) => void;
  _setTitle: (tabId: string, title: string) => void;
  _markAutoTitleAttempted: (tabId: string) => void;
  _setStreaming: (tabId: string, streaming: boolean) => void;
  _setAwaitingBackgroundJoin: (tabId: string, awaiting: boolean) => void;
  _setPreparePhase: (tabId: string, phase: ChatPreparePhase | null) => void;
  _setError: (tabId: string, error: string | null) => void;
  /**
   * Surface an unexpected turn failure as an assistant text bubble (like typical
   * agent UIs). Commits any in-flight stream first; clears tab.error.
   */
  _appendAssistantError: (tabId: string, text: string) => void;
  _setContextTokens: (
    tabId: string,
    tokens: number | null | undefined,
    opts?: {
      windowSize?: number | null;
      source?: "usage_update" | "prompt_usage" | "estimate" | null;
      /** Cumulative session spend in USD (Pi usage totals). */
      costUsd?: number | null;
      breakdown?: ContextUsageBreakdown | null;
      /** When true, clear used/size/spend (legacy). */
      clear?: boolean;
      /** Drop occupancy after compact; keep cumulative spend. */
      clearOccupancy?: boolean;
    },
  ) => void;
  _setPromptStale: (tabId: string, stale: boolean) => void;
  /** Patch tool_use duration / OpenCode time range. */
  _patchToolDuration: (tabId: string, toolUseId: string, duration: number, time?: { start?: number; end?: number }) => void;
  /** Patch the input (and optionally name) of a tool_use block in committed messages or streaming message. */
  _patchToolInput: (tabId: string, toolUseId: string, input: any, name?: string) => void;
  /** Inject a synthetic tool_result when permission is denied/timed out. */
  _injectToolResult: (tabId: string, toolUseId: string, content: string, isError?: boolean) => void;
  _linkSubAgentRun: (
    tabId: string,
    taskToolUseId: string,
    data: { expertId: string; prompt: string; subSessionId?: string; mode?: "sync" | "background" },
  ) => void;
  /** Background Task early start — keep status running until join. */
  _startBackgroundSubAgentRun: (
    tabId: string,
    taskToolUseId: string,
    data: {
      expertId: string;
      prompt: string;
      subSessionId?: string;
    },
  ) => void;
  _markSubAgentLinkDegraded: (tabId: string, taskToolUseId: string) => void;
  _upsertSubAgentActivity: (tabId: string, taskToolUseId: string, block: ContentBlock) => void;
  /** Replace run.blocks from OpenCode SQLite sync (ACP often omits child streams). */
  _setSubAgentSnapshot: (tabId: string, taskToolUseId: string, blocks: ContentBlock[]) => void;
  /** History / reload: seed a SubAgentRun from SQLite activity. */
  _hydrateSubAgentRun: (
    tabId: string,
    taskToolUseId: string,
    data: {
      expertId: string;
      prompt: string;
      subSessionId?: string | null;
      status: "done" | "error" | "running";
      blocks: ContentBlock[];
      error?: string;
    },
  ) => void;
  _completeSubAgentRun: (
    tabId: string,
    taskToolUseId: string,
    status: "done" | "error",
    error?: string,
  ) => void;
}

/**
 * Extract total context window consumption from a single message.
 *
 * Formula: input_tokens + cache_creation_input_tokens + cache_read_input_tokens
 *
 * This is format-agnostic — any agent parser that emits messages with usage
 * fields in the standard shape will work automatically:
 *
 *   { input_tokens, cache_creation_input_tokens?, cache_read_input_tokens?, output_tokens }
 *
 * - Anthropic / Gemini: input_tokens is UN-CACHED only → must add cache_* fields
 * - OpenAI / Qoder:     no prompt caching → cache_* fields are 0 → total = input_tokens
 * - JSONL replay:       result messages may have usage at top level or inside message
 *
 * Returns null if the message doesn't contain token data.
 */
export function computeContextTokens(msg: ChatStreamMessage): number | null {
  // Check result type (backward compatibility with JSONL replay)
  if (msg.type === "result" && !msg.is_error) {
    const usage = (msg.usage || msg.message?.usage) as Record<string, number> | undefined;
    if (usage) {
      const total = usage.total_tokens ?? usage.totalTokens;
      if (typeof total === "number" && total > 0) return total;
      const sum = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
      return sum > 0 ? sum : null;
    }
  }
  // Check assistant messages (OpenCode emits final assistant messages with
  // message.usage containing the complete token breakdown.
  // Other agents should follow the same convention.)
  if (msg.type === "assistant" && msg.message?.usage) {
    const usage = msg.message.usage as Record<string, number>;
    const total = usage.total_tokens ?? usage.totalTokens;
    if (typeof total === "number" && total > 0) return total;
    const sum = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
    return sum > 0 ? sum : null;
  }
  return null;
}

export function mergeTurnMeta(
  tab: Pick<TabState, "turnMeta" | "pendingTurnMeta">,
  messages: ChatStreamMessage[],
  patch: TurnMessageMeta,
): { turnIndex: number; turnMeta: Record<number, TurnMessageMeta>; meta: TurnMessageMeta } {
  const turnIndex = Math.max(0, countUserTurns(messages) - 1);
  const prev = tab.turnMeta[turnIndex];
  const meta: TurnMessageMeta = {
    completedAt: patch.completedAt ?? prev?.completedAt ?? Date.now(),
    modelLabel: patch.modelLabel ?? prev?.modelLabel ?? tab.pendingTurnMeta?.modelLabel,
    summary: patch.summary ?? prev?.summary,
  };
  return {
    turnIndex,
    meta,
    turnMeta: { ...tab.turnMeta, [turnIndex]: meta },
  };
}

export function persistTurnMetaToDisk(
  conversationId: string | null | undefined,
  turnIndex: number,
  meta: TurnMessageMeta,
): void {
  if (!conversationId || turnIndex < 0) return;
  void agentDesktop
    .agentUpsertTurnMeta({ conversationId, turnIndex, meta })
    .catch(() => {});
}

export function projectActiveTab(tabs: TabState[], activeTabId: string) {
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) {
    return {
      messages: [] as ChatStreamMessage[],
      streamingMessage: null as ChatStreamMessage | null,
      turnMeta: {} as Record<number, TurnMessageMeta>,
      sessionId: null as string | null,
      isStreaming: false,
      error: null as string | null,
      contextTokens: null as number | null,
      contextWindowSize: null as number | null,
      contextUsageSource: null as "usage_update" | "prompt_usage" | "estimate" | null,
      contextCostUsd: null as number | null,
      contextBreakdown: null as ContextUsageBreakdown | null,
      promptStale: false,
      isLoadingSession: false,
      streamTick: 0,
      preparePhase: null as ChatPreparePhase | null,
    };
  }

  // Primary: tab-stored contextTokens (set by _setContextTokens during live
  // chat, or restored from sessions-context.json during session load).
  // Fallback: scan messages for usage data (live chat legacy path).
  let contextTokens = tab.contextTokens;
  if (contextTokens === null) {
    for (let i = tab.messages.length - 1; i >= 0; i--) {
      const tokens = computeContextTokens(tab.messages[i]);
      if (tokens !== null) {
        contextTokens = tokens;
        break;
      }
    }
  }

  return {
    messages: tab.messages,
    streamingMessage: tab.streamingMessage,
    turnMeta: tab.turnMeta,
    sessionId: tab.sessionId,
    isStreaming: tab.isStreaming,
    error: tab.error,
    contextTokens,
    contextWindowSize: tab.contextWindowSize,
    contextUsageSource: tab.contextUsageSource,
    contextCostUsd: tab.contextCostUsd,
    contextBreakdown: tab.contextBreakdown,
    promptStale: tab.promptStale,
    isLoadingSession: tab.isLoadingSession,
    streamTick: (tab as any).streamTick || 0,
    preparePhase: tab.preparePhase ?? null,
  };
}

export function syncCitationStagingForTab(tab: TabState | undefined): void {
  if (!tab?.sessionId) {
    useCitationStagingStore.getState().setActiveSession(null);
    return;
  }
  useCitationStagingStore.getState().setActiveSession(tab.sessionId);
  const hasSubAgentBlocks = Object.values(tab.subAgentRuns ?? {}).some((r) => r.blocks.length > 0);
  if (conversationHasContent(tab.conversation) || hasSubAgentBlocks) {
    scheduleCitationStagingBackfillFromConversation(tab.sessionId, tab.conversation, tab.subAgentRuns);
  }
}

/** Merge sub-agent activity blocks (tool_use by id, tool_result by tool_use_id). */
export function upsertSubAgentBlock(blocks: ContentBlock[], incoming: ContentBlock): ContentBlock[] {
  if (incoming.type === "tool_use" && incoming.id) {
    const idx = blocks.findIndex((b) => b.type === "tool_use" && b.id === incoming.id);
    if (idx >= 0) {
      const next = [...blocks];
      next[idx] = { ...next[idx], ...incoming };
      return next;
    }
    return [...blocks, incoming];
  }
  if (incoming.type === "tool_result" && incoming.tool_use_id) {
    const idx = blocks.findIndex(
      (b) => b.type === "tool_result" && b.tool_use_id === incoming.tool_use_id,
    );
    if (idx >= 0) {
      const next = [...blocks];
      next[idx] = incoming;
      return next;
    }
    return [...blocks, incoming];
  }
  if (incoming.type === "text" && incoming.text) {
    const last = blocks[blocks.length - 1];
    if (last?.type === "text") {
      return [...blocks.slice(0, -1), { ...last, text: incoming.text }];
    }
    return [...blocks, incoming];
  }
  if (incoming.type === "thinking") {
    const last = blocks[blocks.length - 1];
    if (last?.type === "thinking") {
      return [...blocks.slice(0, -1), { ...last, ...incoming }];
    }
    return [...blocks, incoming];
  }
  return [...blocks, incoming];
}

/**
 * Prefer longer trailing text/thinking when a SQLite snapshot races behind
 * live ACP accumulation (never shrink a reply that already streamed further).
 */
export function mergeSubAgentSnapshotBlocks(
  prev: ContentBlock[],
  next: ContentBlock[],
): ContentBlock[] {
  if (!prev.length) return next;
  if (!next.length) return prev;
  const result = [...next];
  const lastN = result[result.length - 1];
  const lastP = prev[prev.length - 1];
  if (lastN?.type === "text" && lastP?.type === "text") {
    const a = String(lastP.text || "");
    const b = String(lastN.text || "");
    if (a.length > b.length && (b.length === 0 || a.startsWith(b))) {
      result[result.length - 1] = { ...lastN, text: a };
    }
  } else if (lastN?.type === "thinking" && lastP?.type === "thinking") {
    const a = String(lastP.thinking || lastP.text || "");
    const b = String(lastN.thinking || lastN.text || "");
    if (a.length > b.length && (b.length === 0 || a.startsWith(b))) {
      result[result.length - 1] = { ...lastN, thinking: a, text: a };
    }
  }
  return result;
}

export function refreshAgentSessionList(): void {
  window.dispatchEvent?.(new Event("prism:session-list-refresh"));
}

/** Commit in-flight streaming only during an active turn; discard stale orphans. */
export function finalizeStreamingForMutation(
  tab: TabState,
): Pick<
  TabState,
  "messages" | "streamingMessage" | "streamingPartMessageId" | "settledStreamMessageIds"
> {
  if (!tab.streamingMessage) {
    return {
      messages: tab.messages,
      streamingMessage: null,
      streamingPartMessageId: null,
      settledStreamMessageIds: tab.settledStreamMessageIds,
    };
  }
  if (tab.isStreaming) {
    return {
      messages: [...tab.messages, tab.streamingMessage],
      streamingMessage: null,
      streamingPartMessageId: null,
      settledStreamMessageIds: withSettledStreamMessageId(tab, tab.streamingPartMessageId),
    };
  }
  return {
    messages: tab.messages,
    streamingMessage: null,
    streamingPartMessageId: null,
    settledStreamMessageIds: tab.settledStreamMessageIds,
  };
}

export function conversationDisplayIndex(conv: Conversation | undefined): number {
  if (!conv) return 0;
  return conv.turns.length * 2 + (conv.live ? 1 : 0);
}

export function persistableAttachmentsFromUserBlocks(
  blocks: ContentBlock[] | undefined,
): Array<{ name: string; kind: "image" | "file"; path: string }> {
  const out: Array<{ name: string; kind: "image" | "file"; path: string }> = [];
  const seen = new Set<string>();
  for (const block of blocks ?? []) {
    for (const att of block.attachments ?? []) {
      const path = (att.path || "").trim();
      if (!path || seen.has(path)) continue;
      seen.add(path);
      out.push({
        name: att.name || path.split(/[/\\]/).pop() || "file",
        kind: att.kind === "image" ? "image" : "file",
        path,
      });
    }
  }
  return out;
}

export function applyConversationToTab(
  tab: TabState,
  conversation: Conversation,
  extras?: { planEvents?: import("@shared/agent/api").AgentPlanEvent[] },
): TabState {
  const turnMeta = { ...tab.turnMeta };
  for (const turn of conversation.turns) {
    if (turn.meta) turnMeta[turn.turnIndex] = turn.meta;
  }
  const usage = conversation.usage;
  return {
    ...tab,
    conversation,
    isStreaming: conversation.live !== null,
    turnMeta,
    subAgentRuns: projectConversationSubagentRuns(conversation.subagentRuns),
    ...(typeof usage?.inputTokens === "number" && usage.inputTokens > 0
      ? { contextTokens: usage.inputTokens, contextUsageSource: "usage_update" as const }
      : {}),
    ...(typeof usage?.windowSize === "number" && usage.windowSize > 0
      ? { contextWindowSize: usage.windowSize }
      : {}),
    ...(typeof usage?.costUsd === "number" ? { contextCostUsd: usage.costUsd } : {}),
    ...(usage?.breakdown ? { contextBreakdown: usage.breakdown } : {}),
    ...(extras?.planEvents
      ? { planArtifactCard: planArtifactCardFromEvents(extras.planEvents) }
      : {}),
  };
}

export function projectConversationSubagentRuns(
  runs: Record<string, ConversationSubagentRun> | undefined,
): Record<string, SubAgentRun> {
  const out: Record<string, SubAgentRun> = {};
  for (const [id, run] of Object.entries(runs ?? {})) {
    out[id] = {
      expertId: run.expertName || run.expertFqid || "expert",
      prompt: run.prompt ?? "",
      status: run.status,
      blocks: run.blocks,
      ...(run.error ? { error: run.error } : {}),
    };
  }
  return out;
}


export function createInitialChatData() {
  const initialTabId = newConversationId();
  const initialTab = makeDefaultTab(initialTabId);
  return {
    tabs: [initialTab],
    activeTabId: initialTabId,
    lastTitleByTab: {},
    ...projectActiveTab([initialTab], initialTabId),
    streamTick: 0,
    todoPlanDismissEpoch: 0,
  };
}

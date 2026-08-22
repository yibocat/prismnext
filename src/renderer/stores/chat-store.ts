import { create } from "zustand";
import { toast } from "sonner";
import { i18n } from "@/lib/i18n";
import type { ComposerPart } from "@/lib/chat/composer-parts";
import type {
  ContentBlock as ConversationContentBlock,
  Conversation,
  TurnMessageMeta,
} from "../../shared/agent-conversation";
import { emptyConversation, newConversationId } from "../../shared/agent-conversation";
import type { AgentEvent } from "../../shared/agent-runtime";
import type { ContextUsageBreakdown } from "../../shared/agent-context-usage";
import {
  acknowledgeQuestionAnswer as applyQuestionAnswerToConversation,
  appendAssistantBlocksToLastTurn,
  applyConversationEvent,
  beginConversationTurn,
  ensureTaskRunFromTranscript,
  markSubagentStopping,
} from "@/lib/chat/conversation-reducer";
import type { ConversationSubagentRun } from "../../shared/agent-conversation";
import {
  combineComposerQueueItems,
  type ComposerQueueItem,
} from "@/lib/chat/composer-send-queue";
import { useDocumentStore } from "./document-store";
import { lastPathForSession, sameProjectPath, useWorkbenchStore } from "./workbench-store";
import { applyCheckoutTransition, attachWorktreeForSessionDirectory, captureSessionCwd, isPendingNewWorktree, isWorktreeCheckoutPath, resolveWorktreePathForSend } from "@/lib/git/checkout-context";
import { useWorktreeStore } from "./worktree-store";
import { useSettingsStore } from "./settings-store";
import { truncateChatMessagesToTurn, isToolResultUserMessage, countUserTurns } from "@/components/modules/chat/chat-turns";
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
import { useCitationStagingStore } from "./citation-staging-store";
import type { ChatPreparePhase } from "../../shared/chat-prepare-phases";
import type { SessionAgent } from "../../shared/session-agent";
import {
  isAgentRuntime,
  type ChatRuntimeKind,
} from "../../shared/agent-api";
import type { ResearchPlanStep } from "../../shared/research-plan";
import {
  buildApprovedPlanExecutePrompt,
  checklistToTodoSeeds,
  parsePlanChecklist,
  draftPlanPathBelongsToSession,
  isResearchPlanDraftPath,
  PLAN_REJECT_ACK_PROMPT,
  extractPlanFrontmatterDescription,
  sessionDraftPlanRel,
} from "../../shared/research-plan";

function formatAgentSendError(reason?: string): string {
  if (!reason) return i18n.t("agentLab.sendFailed");
  if (reason === "turn_idle_timeout") return i18n.t("chat.turn_timeout");
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

function newClientTurnId(): string {
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Types ───

export type { TurnMessageMeta };

/** Chat UI block: shared Conversation timeline plus composer inline tokens. */
export interface ContentBlock extends ConversationContentBlock {
  /** Inline @file / @profile / /command tokens in user message order */
  inlineParts?: ComposerPart[];
}

export interface ChatStreamMessage {
  type: "system" | "assistant" | "user" | "result" | "action-status" | "plan-decision" | "plan-artifact";
  subtype?: string;
  session_id?: string;
  message?: {
    content?: ContentBlock[];
    usage?: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
  };
  usage?: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
  cost_usd?: number;
  duration_ms?: number;
  result?: string;
  is_error?: boolean;
  num_turns?: number;
  /** For "action-status" messages: the action key (e.g. "compile-document") */
  action?: string;
  /** For "action-status" messages: display name (e.g. "compile") */
  actionName?: string;
  /** For "action-status" messages: execution status */
  status?: "running" | "success" | "error";
  /** For "plan-decision" messages: user confirmed or rejected the draft. */
  planDecision?: "approved" | "rejected";
  /** Optional plan title / path shown on plan-decision / plan-artifact cards. */
  planTitle?: string;
  planPath?: string;
  /** True when Deny discarded the draft — card stays but is not openable. */
  planDiscarded?: boolean;
  /** True when the assistant turn was interrupted by the user (cancel/stop).
   *  The partial reply is still committed to `messages` (rather than discarded)
   *  so the user keeps what streamed so far; this flag marks it as incomplete. */
  stopped?: boolean;
  /**
   * True when this assistant message is a turn-failure body (OpenCode/provider
   * error or Prism turn failure) printed into the reply stream — enables Retry
   * without a separate error banner.
   */
  turnError?: boolean;
}

interface TabDraft {
  /** JSON draft (`draftToJson`) or legacy plain text */
  input: string;
  /** Structured inline composer parts (preferred) */
  parts?: ComposerPart[];
  /** @deprecated legacy command chips */
  chips?: { id: string; commandName: string; action?: string; source: string }[];
}

interface TabState {
  id: string;
  title: string;
  /** True once the user has explicitly renamed this tab. Blocks OpenCode auto-overwrite
   *  in left-sidebar's fetchSessions sync so user-set titles stick. */
  userTitleSet: boolean;
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

function makeDefaultTab(id: string): TabState {
  return {
    id,
    title: "New Chat",
    userTitleSet: false,
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
function dropTitle(map: Record<string, string>, tabId: string): Record<string, string> {
  if (!(tabId in map)) return map;
  const { [tabId]: _drop, ...rest } = map;
  return rest;
}

function withSettledStreamMessageId(tab: TabState, messageId: string | null | undefined): string[] {
  const id = messageId?.trim();
  if (!id || tab.settledStreamMessageIds.includes(id)) return tab.settledStreamMessageIds;
  return [...tab.settledStreamMessageIds, id];
}

function contentBlocksText(msg: ChatStreamMessage): string {
  const blocks = msg.message?.content;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b): b is ContentBlock & { type: "text"; text: string } =>
      b.type === "text" && typeof b.text === "string",
    )
    .map((b) => b.text)
    .join("\n");
}

function conversationKey(tab: Pick<TabState, "id" | "sessionId" | "conversation">): string {
  return tab.conversation.conversationId || tab.id || tab.sessionId || "";
}

/** Drop stale draft buffers/tabs after Approve (rename) or Deny (delete). */
function evictPlanDraftFromEditor(sessionId: string | null | undefined): void {
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

function collectCommittedToolUseIds(messages: ChatStreamMessage[]): Set<string> {
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

function collectSettledToolResultIds(messages: ChatStreamMessage[]): Set<string> {
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

function hasIncompleteTaskInBlocks(
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
const MSG_CACHE_MAX = 48;
const _msgCache = new Map<string, ChatStreamMessage[]>();

function msgCacheGet(sessionId: string): ChatStreamMessage[] | undefined {
  const hit = _msgCache.get(sessionId);
  if (!hit) return undefined;
  _msgCache.delete(sessionId);
  _msgCache.set(sessionId, hit);
  return hit;
}

function msgCacheSet(sessionId: string, messages: ChatStreamMessage[]): void {
  if (_msgCache.has(sessionId)) _msgCache.delete(sessionId);
  _msgCache.set(sessionId, messages);
  while (_msgCache.size > MSG_CACHE_MAX) {
    const oldest = _msgCache.keys().next().value;
    if (oldest === undefined) break;
    _msgCache.delete(oldest);
  }
}

/** Keep reopen-cache aligned with the live tab (Approve/Deny + Build turns). */
function cacheTabMessages(
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

function syncCheckoutForTab(tab: Pick<TabState, "sessionCwd"> | undefined): void {
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot) return;

  const cwd = tab?.sessionCwd;
  if (cwd && cwd !== projectRoot && isWorktreeCheckoutPath(cwd, projectRoot)) {
    void attachWorktreeForSessionDirectory(cwd);
    return;
  }

  void applyCheckoutTransition({ type: "local" });
}

interface ChatState {

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
  _setTitle: (tabId: string, title: string) => void;
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
function computeContextTokens(msg: ChatStreamMessage): number | null {
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

function mergeTurnMeta(
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

function persistTurnMetaToDisk(
  conversationId: string | null | undefined,
  turnIndex: number,
  meta: TurnMessageMeta,
): void {
  if (!conversationId || turnIndex < 0) return;
  void window.electronAPI
    .agentUpsertTurnMeta({ conversationId, turnIndex, meta })
    .catch(() => {});
}

function projectActiveTab(tabs: TabState[], activeTabId: string) {
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

function syncCitationStagingForTab(tab: TabState | undefined): void {
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
function upsertSubAgentBlock(blocks: ContentBlock[], incoming: ContentBlock): ContentBlock[] {
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
function mergeSubAgentSnapshotBlocks(
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

function refreshAgentSessionList(): void {
  window.dispatchEvent?.(new Event("prism:session-list-refresh"));
}

/** Commit in-flight streaming only during an active turn; discard stale orphans. */
function finalizeStreamingForMutation(
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

function conversationDisplayIndex(conv: Conversation | undefined): number {
  if (!conv) return 0;
  return conv.turns.length * 2 + (conv.live ? 1 : 0);
}

function persistableAttachmentsFromUserBlocks(
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

function applyConversationToTab(
  tab: TabState,
  conversation: Conversation,
  extras?: { planEvents?: import("@shared/agent-api").AgentPlanEvent[] },
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

function projectConversationSubagentRuns(
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

// ─── Store ───

const initialTabId = newConversationId();
const initialTab = makeDefaultTab(initialTabId);

export const useChatStore = create<ChatState>()((set, get) => ({

  // Multi-tab
  tabs: [initialTab],
  activeTabId: initialTabId,
  lastTitleByTab: {},

  // Projected
  ...projectActiveTab([initialTab], initialTabId),
  streamTick: 0,
  todoPlanDismissEpoch: 0,

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

      // Clean up agent session for this tab — cancel any running prompt
      if (isAgentRuntime(closingTab.runtime)) {
        window.electronAPI.agentCancel({ conversationId: id }).catch(() => {});
        window.electronAPI.agentDispose({ conversationId: id }).catch(() => {});
      }
      void import("./checkpoint-store").then(({ useCheckpointStore }) => {
        useCheckpointStore.getState().clearTab(id);
      });
      void import("./terminal-ai-store").then(({ useTerminalAiStore }) => {
        useTerminalAiStore.getState().removeAiTabsForChat(id);
      });
      void import("./execution-store").then(({ useExecutionStore }) => {
        void useExecutionStore.getState().cancelForChat(id);
      });
  },

  renameSession: async (tabId, title) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const nextTitle = title.trim();
    await window.electronAPI.agentRenameSession({
      conversationId: tabId,
      title: nextTitle,
    });
    refreshAgentSessionList();
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
    await window.electronAPI.agentRenameSession({
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
    void import("./terminal-ai-store").then(({ useTerminalAiStore }) => {
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

    const pending = await window.electronAPI.researchPlanHasPendingDraft({
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

  showPlanSuggest: (tabId?: string, reason?: string | null, opts?) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    const clamped = (reason ?? "").trim();
    void import("../../shared/plan-suggest").then(({ PLAN_SUGGEST_TIMEOUT_MS }) => {
      const deadlineAt = opts?.deadlineAt ?? Date.now() + PLAN_SUGGEST_TIMEOUT_MS;
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (t.id !== resolvedTabId) return t;
          if (t.planSuggestDismissed || t.sessionAgent !== "build") return t;
          return {
            ...t,
            planSuggestVisible: true,
            planSuggestDeadlineAt: deadlineAt,
            planSuggestConsentSessionId:
              opts?.sessionId !== undefined
                ? opts.sessionId
                : (t.planSuggestConsentSessionId ?? t.sessionId),
            ...(clamped ? { planSuggestReason: clamped } : {}),
          };
        }),
      }));
    });
  },

  dismissPlanSuggest: (tabId?: string) => {
    void get().finishPlanSuggestConsent("dismissed", tabId);
  },

  timeoutPlanSuggest: (tabId?: string) => {
    void get().finishPlanSuggestConsent("timed_out", tabId);
  },

  acceptPlanSuggest: (tabId?: string) => {
    void get().finishPlanSuggestConsent("accepted", tabId);
  },

  finishPlanSuggestConsent: async (decision, tabId?) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    const tab = get().tabs.find((t) => t.id === resolvedTabId);
    if (!tab?.planSuggestVisible) return;

    const requestId = tab.conversation.pendingPlanSuggest?.requestId;

    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== resolvedTabId) return t;
        return {
          ...t,
          conversation: {
            ...t.conversation,
            pendingPlanSuggest: null,
          },
          planSuggestVisible: false,
          planSuggestReason: null,
          planSuggestDeadlineAt: null,
          planSuggestConsentSessionId: null,
          planSuggestDismissed:
            decision === "dismissed" || decision === "timed_out"
              ? true
              : t.planSuggestDismissed,
        };
      }),
    }));

    if (requestId) {
      const mapped = decision === "accepted" ? "accept" : "dismiss";
      void window.electronAPI
        .agentResolvePlanSuggest({ requestId, decision: mapped })
        .catch(() => {});
    }

    if (decision === "accepted") {
      get().setSessionAgent("plan", resolvedTabId);
      void get().refreshPlanDraftFromDisk(resolvedTabId);
    }
  },

  setPlanDraftFromEvent: (steps: ResearchPlanStep[], title?: string | null, tabId?: string) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === resolvedTabId
          ? {
              ...t,
              planDraftSteps: steps,
              ...(title !== undefined ? { planDraftTitle: title } : {}),
              // Do not mark dirty from checklist alone — formal draft is the file.
            }
          : t,
      ),
    }));
    void get().refreshPlanDraftFromDisk(resolvedTabId);
  },

  clearPlanDraft: (tabId?: string) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === resolvedTabId
          ? {
              ...t,
              planDraftSteps: [],
              planDraftTitle: null,
              planDraftSummary: null,
              planDraftDirty: false,
              planDraftFileReady: false,
              // Keep planArtifactCard — Deny marks discarded; clear only on new draft cycle.
            }
          : t,
      ),
    }));
  },

  refreshPlanDraftFromDisk: async (tabId?: string) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    const tab = get().tabs.find((t) => t.id === resolvedTabId);
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (!projectRoot) return false;

    const sessionId = tab?.sessionId?.trim() || "";
    // Per-session draft; Approve chrome only when this chat session owns it.
    if (!sessionId) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === resolvedTabId
            ? { ...t, planDraftFileReady: false, planDraftDirty: false }
            : t,
        ),
      }));
      return false;
    }

    const wasReady = tab?.planDraftFileReady ?? false;

    const claimed = await window.electronAPI.researchPlanClaimDraft({
      projectRoot,
      sessionId,
    });
    if (!claimed.ok) return false;

    const ready = claimed.owned && !claimed.ownedByOther;
    const draftPath = claimed.relativePath || sessionDraftPlanRel(sessionId);
    let summary: string | null = claimed.description?.trim() || null;
    if (ready && !summary) {
      const draft = await window.electronAPI.researchPlanReadDraft({
        projectRoot,
        sessionId,
      });
      if (draft.ok && draft.markdown) {
        summary = extractPlanFrontmatterDescription(draft.markdown) || null;
      } else if (draft.ok && draft.description) {
        summary = draft.description.trim() || null;
      }
    }
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === resolvedTabId
          ? {
              ...t,
              planDraftFileReady: ready,
              planDraftDirty: ready,
              planDraftSummary: ready ? summary : null,
              ...(claimed.title ? { planDraftTitle: claimed.title } : {}),
            }
          : t,
      ),
    }));
    if (ready) {
      get().ensurePlanArtifactCard(resolvedTabId, {
        title: claimed.title,
        path: draftPath,
      });
    }
    const shouldAutoOpen =
      ready
      && !wasReady
      && tab?.sessionAgent === "plan"
      && !tab?.planConfirmSuppressed
      && resolvedTabId === get().activeTabId;
    if (shouldAutoOpen) {
      void get().openPlanFileInEditor(draftPath);
    }
    return ready;
  },

  ensurePlanArtifactCard: (tabId, args) => {
    const path = args.path.replace(/\\/g, "/");
    const title = args.title?.trim() || undefined;
    let afterIndex = 0;
    let conversationId = "";
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        conversationId = conversationKey(t);
        afterIndex = t.conversation.turns.length * 2 + (t.conversation.live ? 1 : 0);
        return {
          ...t,
          planArtifactCard: {
            path,
            title: title ?? t.planArtifactCard?.title,
            discarded: false,
          },
        };
      }),
    }));
    if (conversationId) {
      void window.electronAPI.agentUpsertPlanArtifact({
        conversationId,
        event: {
          kind: "plan-artifact",
          path,
          title,
          discarded: false,
          afterIndex,
        },
      });
    }
  },

  openPlanFileInEditor: async (relativePath: string) => {
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (!projectRoot || !relativePath.trim()) return;
    const rel = relativePath.replace(/\\/g, "/");

    // Don't reopen a Deny-deleted draft from editor cache.
    if (isResearchPlanDraftPath(rel)) {
      const tab = get().tabs.find((t) => t.id === get().activeTabId);
      const draft = await window.electronAPI.researchPlanReadDraft({
        projectRoot,
        sessionId: tab?.sessionId ?? undefined,
      });
      if (!draft.ok || !draft.exists || draft.empty) {
        toast.message(i18n.t("chat.planWorkflow.draftDiscardedGone"));
        return;
      }
      // Keep ready flags / toolbar in sync when opening Created Plan.
      void get().refreshPlanDraftFromDisk();
    }

    const { openProjectFileFromChat } = await import("@/lib/files/open-project-file");
    const ok = await openProjectFileFromChat(rel, { pin: true });
    if (!ok) {
      toast.message(i18n.t("chat.planWorkflow.planFileMissing"));
    }
  },

  openPlanDraftInEditor: async () => {
    const projectRoot = useDocumentStore.getState().projectRoot;
    const tab = get().tabs.find((t) => t.id === get().activeTabId);
    const sessionId = tab?.sessionId?.trim();
    if (!projectRoot || !sessionId) return;
    const draft = await window.electronAPI.researchPlanReadDraft({
      projectRoot,
      sessionId,
    });
    if (!draft.ok) {
      toast.error(draft.error || i18n.t("chat.planWorkflow.saveFailed"));
      return;
    }
    if (!draft.exists || draft.empty) {
      toast.message(i18n.t("chat.planWorkflow.draftNotYet"));
      if (!draft.exists) return;
    }
    await get().refreshPlanDraftFromDisk();
    await get().openPlanFileInEditor(draft.relativePath || sessionDraftPlanRel(sessionId));
  },

  openPlanExitDialog: (tabId?: string) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === resolvedTabId ? { ...t, planExitDialogOpen: true } : t,
      ),
    }));
  },

  closePlanExitDialog: (tabId?: string) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === resolvedTabId ? { ...t, planExitDialogOpen: false } : t,
      ),
    }));
  },

  approveAndExecutePlan: async (tabId?: string) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    const tab = get().tabs.find((t) => t.id === resolvedTabId);
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (!tab || !projectRoot) return;

    const promoted = await window.electronAPI.researchPlanPromoteDraft({
      projectRoot,
      sessionId: tab.sessionId ?? undefined,
    });
    if (!promoted.ok) {
      toast.error(promoted.error || i18n.t("chat.planWorkflow.approveNeedsContent"));
      return;
    }

    get().setSessionAgent("build", resolvedTabId);
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === resolvedTabId ? { ...t, composerToolsSuppressed: false } : t,
      ),
    }));
    get().clearPlanDraft(resolvedTabId);
    get().closePlanExitDialog(resolvedTabId);

    // Draft path was renamed away — drop stale editor buffer for this session's draft.
    evictPlanDraftFromEditor(tab.sessionId);

    // Point the in-stream plan card at the approved file + decision card.
    get().ensurePlanArtifactCard(resolvedTabId, {
      title: promoted.title,
      path: promoted.relativePath,
    });
    const afterApprove = conversationDisplayIndex(
      get().tabs.find((t) => t.id === resolvedTabId)?.conversation,
    );

    // Seed Task Plan UI immediately from Checklist — do not wait for the model.
    const todoSeeds = checklistToTodoSeeds(parsePlanChecklist(promoted.markdown));
    if (todoSeeds.length > 0) {
      set((s) => {
        const tabs = s.tabs.map((t) => {
          if (t.id !== resolvedTabId) return t;
          return applyConversationToTab(t, appendAssistantBlocksToLastTurn(t.conversation, [{
            type: "tool_use",
            name: "todowrite",
            id: `todo-approve-${Date.now()}`,
            input: { todos: todoSeeds },
          }]));
        });
        return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
      });
    }

    if (tab.sessionId) {
      void window.electronAPI.agentAppendPlanDecision({
        conversationId: conversationKey(tab),
        event: {
          kind: "plan-decision",
          decision: "approved",
          path: promoted.relativePath,
          title: promoted.title,
          afterIndex: afterApprove,
        },
      });
    }

    await get().sendPrompt(
      buildApprovedPlanExecutePrompt({
        relativePath: promoted.relativePath,
        title: promoted.title,
        todos: todoSeeds,
      }),
      undefined,
      true,
    );
  },

  exitPlanDiscardAndBuild: async (tabId?: string) => {
    const resolvedTabId = tabId ?? get().activeTabId;
    const tab = get().tabs.find((t) => t.id === resolvedTabId);
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (!tab) return;

    // Stop any in-flight Plan turn; keep the chat tab/session for further talk.
    if (tab.isStreaming && get().activeTabId === resolvedTabId) {
      await get().cancelExecution();
    }

    if (projectRoot) {
      await window.electronAPI
        .researchPlanDiscardDraft({
          projectRoot,
          sessionId: tab.sessionId ?? undefined,
        })
        .catch(() => {});
    }

    const draftTitle = tab.planDraftTitle ?? undefined;
    const hadSession = !!tab.sessionId;

    // Evict draft from editor cache / RightArea so Deny can't reopen stale buffer.
    evictPlanDraftFromEditor(tab.sessionId);

    get().setSessionAgent("build", resolvedTabId);
    get().clearPlanDraft(resolvedTabId);
    get().closePlanExitDialog(resolvedTabId);

    // Mark Created Plan card discarded (inline card under write tool; no chevron).
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== resolvedTabId) return t;
        if (!t.planArtifactCard) return t;
        return {
          ...t,
          planArtifactCard: {
            ...t.planArtifactCard,
            path: "",
            discarded: true,
          },
        };
      }),
    }));

    const afterDeny = conversationDisplayIndex(
      get().tabs.find((t) => t.id === resolvedTabId)?.conversation,
    );

    if (tab.sessionId) {
      const conversationId = conversationKey(tab);
      void window.electronAPI.agentMarkPlanArtifactDiscarded(conversationId);
      void window.electronAPI.agentAppendPlanDecision({
        conversationId,
        event: {
          kind: "plan-decision",
          decision: "rejected",
          title: draftTitle,
          afterIndex: afterDeny,
        },
      });
    }

    // Brief agent acknowledgment — no user bubble; stripped again on hydrate.
    if (hadSession) {
      await get().sendPrompt(PLAN_REJECT_ACK_PROMPT, undefined, true);
    }
  },

  // ─── Chat Actions ───

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
        const boundCheckoutPath =
          resolveWorktreePathForSend(get().tabs.find((t) => t.id === tabId), projectPath)
          ?? captureSessionCwd()
          ?? projectPath;
        const result = await window.electronAPI.agentSend({
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
      } catch (err: any) {
        get()._applyAgentEvent(tabId, {
          type: "turn_failed",
          runtimeSessionId: tabId,
          tabId,
          turnId,
          error: err?.message || String(err),
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
      await window.electronAPI.agentCancelSubagent({
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
      await window.electronAPI.agentCancel({ conversationId: tabId });
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

  enqueueComposerSend: (tabId, item) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, composerSendQueue: [...t.composerSendQueue, item] }
          : t,
      ),
    }));
  },

  removeComposerSend: (tabId, itemId) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              composerSendQueue: t.composerSendQueue.filter((q) => q.id !== itemId),
            }
          : t,
      ),
    }));
  },

  prioritizeComposerSend: (tabId, itemId) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const idx = t.composerSendQueue.findIndex((q) => q.id === itemId);
        if (idx <= 0) return t;
        const item = t.composerSendQueue[idx];
        const rest = t.composerSendQueue.filter((q) => q.id !== itemId);
        return {
          ...t,
          composerSendQueue: [item, ...rest],
        };
      }),
    }));
  },

  commitComposerQueueFlush: (tabId) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId || t.composerSendQueue.length === 0) return t;
        const combined = combineComposerQueueItems(t.composerSendQueue);
        // If a previous flush is still waiting, fold it in front of the new combine.
        const pending = t.composerQueuePendingFlush
          ? combineComposerQueueItems([t.composerQueuePendingFlush, combined])
          : combined;
        return {
          ...t,
          composerSendQueue: [],
          composerQueuePendingFlush: pending,
        };
      }),
    }));
  },

  promoteComposerSendToPendingFlush: (tabId, itemId) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const idx = t.composerSendQueue.findIndex((q) => q.id === itemId);
        if (idx < 0) return t;
        const item = t.composerSendQueue[idx]!;
        const rest = t.composerSendQueue.filter((q) => q.id !== itemId);
        const pending = t.composerQueuePendingFlush
          ? combineComposerQueueItems([item, t.composerQueuePendingFlush])
          : item;
        return {
          ...t,
          composerSendQueue: rest,
          composerQueuePendingFlush: pending,
        };
      }),
    }));
  },

  clearComposerSendQueue: (tabId) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, composerSendQueue: [], composerQueuePendingFlush: null }
          : t,
      ),
    }));
  },

  takeComposerSendQueueHead: (tabId) => {
    let taken: ComposerQueueItem | null = null;
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId || t.composerSendQueue.length === 0) return t;
        const [head, ...rest] = t.composerSendQueue;
        taken = head;
        return {
          ...t,
          composerSendQueue: rest,
        };
      }),
    }));
    return taken;
  },

  takeComposerSendQueueCombined: (tabId) => {
    let taken: ComposerQueueItem | null = null;
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId || t.composerSendQueue.length === 0) return t;
        taken = combineComposerQueueItems(t.composerSendQueue);
        return {
          ...t,
          composerSendQueue: [],
        };
      }),
    }));
    return taken;
  },

  takeComposerQueuePendingFlush: (tabId) => {
    let taken: ComposerQueueItem | null = null;
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId || !t.composerQueuePendingFlush) return t;
        taken = t.composerQueuePendingFlush;
        return { ...t, composerQueuePendingFlush: null };
      }),
    }));
    return taken;
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
      void window.electronAPI?.agentDispose?.({ conversationId: tab.id })?.catch(() => {});
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
      window.electronAPI.agentDispose({ conversationId: tabId }).catch(() => {});
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
              error: null,
              isStreaming: false,
              promptStale: false,
              isLoadingSession: false,
            }
          : t,
      );
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
    void import("./checkpoint-store").then(({ useCheckpointStore }) => {
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
    const result = await window.electronAPI.agentLoadSession({
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

  loadSession: async (conversationId: string, sessionDirectory?: string, projectLastPath?: string) => {
    if (!conversationId.trim()) return;
    const mappedPath = projectLastPath || lastPathForSession(conversationId);
    const currentRoot = useDocumentStore.getState().projectRoot || "";
    if (mappedPath && !sameProjectPath(mappedPath, currentRoot)) {
      await useDocumentStore.getState().focusProject(mappedPath);
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
      const result = await window.electronAPI.agentLoadSession({
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

  // ─── Internal ───

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
    const started = get().tabs.find((tab) => tab.id === tabId);
    const turnIndex = started?.conversation.live?.turnIndex ?? 0;
    const sessionId = started?.conversation.conversationId || started?.sessionId || tabId;
    void import("./checkpoint-store").then(({ useCheckpointStore }) => {
      const checkpoints = useCheckpointStore.getState();
      if (sessionId && checkpoints.byTab[tabId]?.sessionId !== sessionId) {
        checkpoints.setSessionId(tabId, sessionId);
      }
      checkpoints.beginTurn(tabId, turnIndex);
    });
  },

  _applyAgentEvent: (tabId, event) => {
    set((state) => {
      const tabs = state.tabs.map((tab) => {
        if (tab.id !== tabId) return tab;
        // Map the main-process idle-timeout error code to a readable message
        // before it lands in the turn error block / tab error.
        const mapped =
          event.type === "turn_failed" && event.error
            ? { ...event, error: formatAgentSendError(event.error) }
            : event;
        const conversation = applyConversationEvent(tab.conversation, mapped);
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
      void import("./checkpoint-store").then(({ useCheckpointStore }) => {
        void useCheckpointStore.getState().finalizeTurn(tabId, event.type === "turn_finished");
      });
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
    void import("./terminal-ai-store").then(({ useTerminalAiStore }) => {
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
}));

(useChatStore as any)._msgCache = _msgCache;

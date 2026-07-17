import { create } from "zustand";
import type { ComposerPart } from "@/lib/chat/composer-parts";
import { useDocumentStore } from "./document-store";
import { useWorktreeStore } from "./worktree-store";
import { applyCheckoutTransition, attachWorktreeForSessionDirectory, captureSessionCwd, resolveWorktreeAtCheckout, resolveWorktreePathForSend, isWorktreeCheckoutPath } from "@/lib/git/checkout-context";
import { isWorktreeDirectoryActive } from "@/lib/git/worktree-path";
import { isWorktreeCheckoutOnDisk } from "@/lib/git/worktree-present";
import { rehomeWorktreeSessions } from "@/lib/git/worktree-sessions";
import { useGitStore } from "./git-store";
import { useSettingsStore } from "./settings-store";
import { truncateChatMessagesToTurn, applyUserDisplaySnapshots, isToolResultUserMessage } from "@/components/modules/chat/chat-turns";
import { mapOpenCodePartToBlocks } from "@/lib/chat/message-parts";
import { hydrateSessionMessages } from "@/lib/chat/session-message-hydrate";
import { clearTurnWindowState } from "@/lib/chat/turn-window";
import { contentBlocks } from "@/components/modules/chat/tools/tool-result-map";
import {
  deriveSessionTitleForSend,
  extractSessionTitle,
  isGenericSessionTitle,
  pruneDisposableEmptyChatTabs,
} from "@/lib/chat/session-title";
import {
  persistAndSyncIntensiveReading,
  resolveIntensivePaperIdsForSession,
} from "@/lib/literature/sync-intensive-reading";
import { scheduleCitationStagingBackfill } from "@/lib/literature/sync-citation-staging-from-messages";
import { useCitationStagingStore } from "./citation-staging-store";
import type { ChatPreparePhase } from "../../shared/chat-prepare-phases";

// ─── Types ───

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking" | "command" | "profile";
  text?: string;
  /** Inline @file / @profile / /command tokens in user message order */
  inlineParts?: ComposerPart[];
  /** External attach / paste / drop strip (not inline tokens). */
  attachments?: Array<{
    name: string;
    kind: "image" | "file";
    path: string;
    previewUrl?: string;
    note?: string;
  }>;
  id?: string;
  name?: string;
  /** For "profile" blocks: agent profile id */
  profileId?: string;
  input?: any;
  tool_use_id?: string;
  content?: any;
  is_error?: boolean;
  /** For "command" blocks: the action key if this is an action command */
  action?: string;
  thinking?: string;
  duration?: number; // thinking duration in seconds (cached for old sessions)
  signature?: string;
  /** true = init progress, not real AI thinking. Rendered as collapsible
   *  "Initialization" block with no copy button. Committed to history on
   *  first turn only; excluded from streaming indicator logic. */
  _progress?: boolean;
  /** OpenCode tool_call: human-readable description of what the tool is doing */
  title?: string;
  /** OpenCode tool_call: tool category (fs, terminal, search, network, workflow) */
  kind?: string;
  /** OpenCode tool_call / tool_call_update: execution status */
  status?: string;
  /** OpenCode tool_call: affected file locations */
  locations?: Array<{ file: string; line?: number }>;
  /** Internal: backfilled tool_call input received in the tool_call_update
   *  (OpenCode sends empty rawInput on the initial tool_call, real params
   *  arrive later in tool_call_update). Set by event-mapper, consumed by
   *  use-opencode-events to patch the tool_use block. */
  _backfillInput?: Record<string, unknown> | null;
  /** Internal: backfilled tool name (matches _backfillInput). */
  _backfillName?: string | null;
}


export interface ChatStreamMessage {
  type: "system" | "assistant" | "user" | "result" | "action-status";
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
  /** Persisted context breakdown from result message (for JSONL replay) */
  contextBreakdown?: Record<string, number> | null;
  /** Persisted category schema from result message (for JSONL replay) */
  categorySchema?: { key: string; label: string; color: string; description?: string; order?: number }[] | null;
  /** True when the assistant turn was interrupted by the user (cancel/stop).
   *  The partial reply is still committed to `messages` (rather than discarded)
   *  so the user keeps what streamed so far; this flag marks it as incomplete. */
  stopped?: boolean;
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
  sessionId: string | null;
  /** Committed messages — immutable once added. Never modified in-place. */
  messages: ChatStreamMessage[];
  /** In-progress streaming assistant message. Merged/updated on each delta.
   *  Committed to `messages` when a non-assistant event arrives or streaming ends. */
  streamingMessage: ChatStreamMessage | null;
  /** OpenCode assistant message id for the active streaming turn (blocks isolation). */
  streamingPartMessageId: string | null;
  /**
   * OpenCode messageIds already committed for this tab. Late ACP replays of
   * those ids must not re-enter `streamingMessage` (otherwise prior-turn tools /
   * thoughts append under the latest turn until restart/hydrate).
   */
  settledStreamMessageIds: string[];
  isStreaming: boolean;
  error: string | null;
  draft: TabDraft;
  /** Message index → meta text (completion time + tokens). Key is the
   *  index of the assistant message in this.messages. Indices are stable
   *  because messages are only ever appended, never removed/reordered. */
  messageMeta: Record<number, string>;
  /** Per-tab context token total — persisted alongside breakdown. Source of
   *  truth for the context ring. Set by _setContextTokens (live) or restored
   *  from sessions-context.json (loaded). */
  contextTokens: number | null;
  /** Per-tab context token breakdown (set by _setContextTokens or sessionGetContext) */
  contextBreakdown: Record<string, number> | null;
  /** Per-tab category schema (set by _setContextTokens or sessionGetContext) */
  categorySchema: { key: string; label: string; color: string; description?: string; order?: number }[] | null;
  /** True when live prompt config differs from this session's injected fingerprint. */
  promptStale: boolean;
  /** Expert team orchestrator id (null → project default). */
  orchestratorId: string | null;
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
   * First-turn preparation stage from main (`system.prepare`) while there is
   * still no assistant content — shown instead of a bare "Thinking…".
   */
  preparePhase: ChatPreparePhase | null;
}

export interface SubAgentRun {
  expertId: string;
  prompt: string;
  status: "running" | "done" | "error";
  subSessionId?: string;
  blocks: ContentBlock[];
}

let _nextTabId = 1;
function nextTabId(): string {
  return `tab-${_nextTabId++}`;
}

function makeDefaultTab(id: string): TabState {
  return {
    id,
    title: "New Chat",
    sessionId: null,
    messages: [],
    streamingMessage: null,
    streamingPartMessageId: null,
    settledStreamMessageIds: [],
    isStreaming: false,
    error: null,
    draft: { input: "" },
    messageMeta: {},
    contextTokens: null,
    contextBreakdown: null,
    categorySchema: null,
    promptStale: false,
    orchestratorId: null,
    isLoadingSession: false,
    sessionCwd: null,
    intensivePaperIds: [],
    subAgentRuns: {},
    preparePhase: null,
  };
}

function withSettledStreamMessageId(tab: TabState, messageId: string | null | undefined): string[] {
  const id = messageId?.trim();
  if (!id || tab.settledStreamMessageIds.includes(id)) return tab.settledStreamMessageIds;
  return [...tab.settledStreamMessageIds, id];
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

/** @internal — exercise LRU via the same path as production. */
export function _msgCacheSetForTests(sessionId: string, messages: ChatStreamMessage[]): void {
  msgCacheSet(sessionId, messages);
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

  // Projected fields (from active tab) — for backward compat
  messages: ChatStreamMessage[];
  streamingMessage: ChatStreamMessage | null;
  messageMeta: Record<number, string>;
  sessionId: string | null;
  isStreaming: boolean;
  error: string | null;
  /** Current context window tokens used (from latest message with usage) — null = no conversation yet */
  contextTokens: number | null;
  /** Categorized token breakdown (Record<categoryKey, tokenCount>). null = no data. */
  contextBreakdown: Record<string, number> | null;
  /** Category definitions for the context ring (drives UI rendering). null = no schema. */
  categorySchema: { key: string; label: string; color: string; description?: string; order?: number }[] | null;
  /** True when prompt/rules changed since this session's system prompt was set. */
  promptStale: boolean;
  /** True while the active tab is loading session history from disk. */
  isLoadingSession: boolean;
  /** Debug: incremented on every _upsertLastMessage call to verify re-renders */
  streamTick: number;
  /** Active tab first-turn prepare phase (projected). */
  preparePhase: ChatPreparePhase | null;

  // Tab management
  createTab: () => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  moveTab: (fromIndex: number, toIndex: number) => void;
  saveDraft: (tabId: string, draft: TabDraft) => void;

  // Intensive reading list (per-tab)
  /** Add a paper to this tab's intensive reading list (idempotent). */
  addIntensivePaper: (tabId: string, paperId: string) => void;
  /** Remove a paper from this tab's intensive reading list (leaves @ chips alone). */
  removeIntensivePaper: (tabId: string, paperId: string) => void;
  /** Clear all intensive papers for this tab (list empty = intensive mode off). */
  clearIntensivePapers: (tabId: string) => void;

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
      promptImages?: Array<{ mimeType: string; data: string; name: string; uri?: string }>;
      promptFiles?: Array<{ uri: string; name: string; mimeType: string; size?: number }>;
    },
  ) => Promise<void>;
  cancelExecution: () => Promise<void>;
  newSession: () => void;
  clearAllSessions: () => void;
  clearCurrentTab: () => void;
  loadSession: (sessionId: string, sessionDirectory?: string) => Promise<void>;
  /** Re-check prompt fingerprint vs session for one tab (after settings edits). */
  checkPromptStale: (tabId?: string) => Promise<void>;
  /** Truncate in-memory messages (and OpenCode session via checkpoint-store) to a turn. */
  truncateToTurn: (tabId: string, turnIndex: number) => void;
  /** Restore full message list after undoing a file restore. */
  restoreMessages: (tabId: string, messages: ChatStreamMessage[]) => void;
  /** Reload sanitized messages from disk after OpenCode session truncation. */
  resyncTabMessagesFromDisk: (tabId: string) => Promise<void>;

  // Internal (called by use-opencode-events)
  _appendMessage: (tabId: string, msg: ChatStreamMessage) => void;
  _upsertLastMessage: (tabId: string, msg: ChatStreamMessage, messageId?: string) => void;
  _setSessionId: (tabId: string, id: string) => void;
  _setTitle: (tabId: string, title: string) => void;
  _setStreaming: (tabId: string, streaming: boolean) => void;
  _setPreparePhase: (tabId: string, phase: ChatPreparePhase | null) => void;
  _setError: (tabId: string, error: string | null) => void;
  _setContextTokens: (tabId: string, tokens: number, breakdown?: Record<string, number> | null, schema?: { key: string; label: string; color: string; description?: string; order?: number }[] | null) => void;
  _setPromptStale: (tabId: string, stale: boolean) => void;
  /** Patch the input (and optionally name) of a tool_use block in committed messages or streaming message. */
  _patchToolInput: (tabId: string, toolUseId: string, input: any, name?: string) => void;
  /** Inject a synthetic tool_result when permission is denied/timed out. */
  _injectToolResult: (tabId: string, toolUseId: string, content: string, isError?: boolean) => void;
  _linkSubAgentRun: (
    tabId: string,
    taskToolUseId: string,
    data: { expertId: string; prompt: string; subSessionId?: string },
  ) => void;
  _upsertSubAgentActivity: (tabId: string, taskToolUseId: string, block: ContentBlock) => void;
  _completeSubAgentRun: (tabId: string, taskToolUseId: string, status: "done" | "error") => void;
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
    const usage = msg.usage || msg.message?.usage;
    if (usage) {
      return (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
    }
  }
  // Check assistant messages (OpenCode emits final assistant messages with
  // message.usage containing the complete token breakdown.
  // Other agents should follow the same convention.)
  if (msg.type === "assistant" && msg.message?.usage) {
    const usage = msg.message.usage;
    return (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  }
  return null;
}

/**
 * Extract persisted context breakdown from the latest result message.
 * Used when restoring breakdown on tab switch / session load.
 * Returns null if no persisted breakdown is found in the messages.
 */
function extractPersistedBreakdown(messages: ChatStreamMessage[]): {
  contextBreakdown: Record<string, number> | null;
  categorySchema: { key: string; label: string; color: string; description?: string; order?: number }[] | null;
} {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.contextBreakdown) {
      return {
        contextBreakdown: msg.contextBreakdown,
        categorySchema: msg.categorySchema ?? null,
      };
    }
  }
  return { contextBreakdown: null, categorySchema: null };
}

function projectActiveTab(tabs: TabState[], activeTabId: string) {
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) {
    return {
      messages: [] as ChatStreamMessage[],
      streamingMessage: null as ChatStreamMessage | null,
      messageMeta: {} as Record<number, string>,
      sessionId: null as string | null,
      isStreaming: false,
      error: null as string | null,
      contextTokens: null as number | null,
      contextBreakdown: null as Record<string, number> | null,
      categorySchema: null as { key: string; label: string; color: string; description?: string; order?: number }[] | null,
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
    messageMeta: tab.messageMeta,
    sessionId: tab.sessionId,
    isStreaming: tab.isStreaming,
    error: tab.error,
    contextTokens,
    contextBreakdown: tab.contextBreakdown,
    categorySchema: tab.categorySchema,
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
  if (tab.messages.length > 0 || hasSubAgentBlocks) {
    scheduleCitationStagingBackfill(tab.sessionId, tab.messages, tab.subAgentRuns);
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

/** Tell main process which chat tab owns an OpenCode session (stream routing). */
function syncTabSessionMapping(tabId: string, sessionId: string): void {
  const projectPath = useDocumentStore.getState().projectRoot || undefined;
  void window.electronAPI.chatRegisterTab({ tabId, sessionId, projectPath });
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

// ─── Store ───

const initialTabId = nextTabId();
const initialTab = makeDefaultTab(initialTabId);

export const useChatStore = create<ChatState>()((set, get) => ({

  // Multi-tab
  tabs: [initialTab],
  activeTabId: initialTabId,

  // Projected
  ...projectActiveTab([initialTab], initialTabId),
  messageMeta: {} as Record<number, string>,
  streamTick: 0,

  // ─── Tab Management ───

  createTab: () => {
    const id = nextTabId();
    const tab = makeDefaultTab(id);
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: id,
      ...projectActiveTab([...s.tabs, tab], id),
    }));
    syncCheckoutForTab(tab);
    syncCitationStagingForTab(tab);
    return id;
  },

  closeTab: (id: string) => {
    const { tabs, activeTabId } = get();
    if (tabs.length <= 1) return;
    const closingTab = tabs.find((t) => t.id === id);
    if (!closingTab || closingTab.isStreaming) return;

    const newTabs = tabs.filter((t) => t.id !== id);
    let newActiveId = activeTabId;
    if (activeTabId === id) {
      const idx = tabs.findIndex((t) => t.id === id);
      const newIdx = Math.max(0, Math.min(idx, newTabs.length - 1));
      newActiveId = newTabs[newIdx].id;
    }
    // Hydrate new active tab with persisted breakdown if needed
    const newActiveTab = newTabs.find((t) => t.id === newActiveId);
    let hydratedTabs = newTabs;
    if (newActiveTab && newActiveTab.contextBreakdown === null) {
      const extracted = extractPersistedBreakdown(newActiveTab.messages);
      if (extracted.contextBreakdown) {
        hydratedTabs = newTabs.map((t) =>
          t.id === newActiveId ? { ...t, contextBreakdown: extracted.contextBreakdown, categorySchema: extracted.categorySchema } : t,
        );
      }
    }
    set({
      tabs: hydratedTabs,
      activeTabId: newActiveId,
      ...projectActiveTab(hydratedTabs, newActiveId),
    });
    syncCheckoutForTab(hydratedTabs.find((t) => t.id === newActiveId));
    syncCitationStagingForTab(hydratedTabs.find((t) => t.id === newActiveId));
    clearTurnWindowState(id);

      // Clean up agent session for this tab — cancel any running prompt
      if (closingTab.sessionId) {
        window.electronAPI.chatCancel(closingTab.sessionId).catch(() => {});
      }
      void import("./checkpoint-store").then(({ useCheckpointStore }) => {
        useCheckpointStore.getState().clearTab(id);
      });
      void import("./terminal-ai-store").then(({ useTerminalAiStore }) => {
        useTerminalAiStore.getState().removeAiTabsForChat(id);
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
    syncCheckoutForTab(targetTab);
    syncCitationStagingForTab(targetTab);
    void import("./terminal-ai-store").then(({ useTerminalAiStore }) => {
      useTerminalAiStore.getState().touchSessionViewed(id);
    });

    // Hydrate context breakdown asynchronously if missing
    if (targetTab && targetTab.contextBreakdown === null && targetTab.sessionId) {
      const projectPath = useDocumentStore.getState().projectRoot || "";
      const sessionId = targetTab.sessionId;
      window.electronAPI.sessionGetContext(projectPath, sessionId).then((ctxData) => {
        if (ctxData) {
          useChatStore.setState((s) => {
            const tabs = s.tabs.map((t) =>
              t.id === id
                ? { ...t, contextTokens: ctxData.tokens, contextBreakdown: ctxData.breakdown, categorySchema: ctxData.schema }
                : t,
            );
            if (s.activeTabId === id) {
              return {
                tabs,
                contextTokens: ctxData.tokens,
                contextBreakdown: ctxData.breakdown,
                categorySchema: ctxData.schema,
              };
            }
            return { tabs };
          });
        }
      }).catch(() => {});
    }
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
      promptImages?: Array<{ mimeType: string; data: string; name: string; uri?: string }>;
      promptFiles?: Array<{ uri: string; name: string; mimeType: string; size?: number }>;
    },
  ) => {
    const docState = useDocumentStore.getState();
    const projectPath = docState.projectRoot || "";
    const tabId = get().activeTabId;

    const tabBeforePrompt = get().tabs.find((t) => t.id === tabId);
    const isFirstTurn = !tabBeforePrompt?.sessionId;

    // ── 1. Add user message (unless skipped — caller already inserted it) ──
    const userMessage: ChatStreamMessage | null = skipUserMessage
      ? null
      : {
          type: "user",
          message: { content: userContent || [{ type: "text", text: userPrompt }] },
        };

    set((s) => {
      const tabs = s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const finalized = finalizeStreamingForMutation(t);
        const snapshot = { ...t, ...finalized };
        return {
          ...snapshot,
          title: deriveSessionTitleForSend(snapshot, userPrompt, userContent, userMessage),
          messages: userMessage ? [...finalized.messages, userMessage] : finalized.messages,
          isStreaming: true,
          error: null,
        };
      });
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });

    const tabAfterUser = get().tabs.find((t) => t.id === tabId);
    if (tabAfterUser) {
      const { countUserTurns } = await import("@/components/modules/chat/chat-turns");
      const { useCheckpointStore } = await import("./checkpoint-store");
      const turnIndex = countUserTurns(tabAfterUser.messages) - 1;
      if (turnIndex >= 0) {
        useCheckpointStore.getState().beginTurn(tabId, turnIndex);
      }
    }

    const resolveWorktree = async (): Promise<string | null> => {
      const worktreeStore = useWorktreeStore.getState();
      if (worktreeStore.mode !== "worktree") return null;
      try {
        let wt = worktreeStore.activeWorktree;
        if (!wt && worktreeStore.pendingBranch && projectPath) {
          wt = await worktreeStore.initializeWorktree(projectPath);
          await worktreeStore.preScanWorktree(wt.path).catch(() => {});
        }
        if (wt) {
          await applyCheckoutTransition({ type: "checkout-at", root: wt.path, worktree: wt });
        }
        return wt?.path ?? null;
      } catch {
        throw new Error("Worktree initialization failed");
      }
    };

    // ── 2. Collect agent settings from persisted settings ──
    let worktreePath: string | null = null;

    const tabForSend = get().tabs.find((t) => t.id === tabId);

    if (isFirstTurn) {
      // First turn: save files, handle branch switch, resolve worktree.
      // Pre-warm already spawned OpenCode — no progress UI needed.
      await docState.saveAllFiles();

      const gitStore = useGitStore.getState();
      const worktreeStore = useWorktreeStore.getState();
      if (gitStore.pendingBranch && gitStore.pendingBranch !== gitStore.branch) {
        if (worktreeStore.mode === "worktree" && !worktreeStore.activeWorktree) {
          applyCheckoutTransition({
            type: "worktree-intent",
            baseBranch: gitStore.pendingBranch,
          });
        } else if (worktreeStore.mode !== "worktree") {
          await gitStore.switchBranch(projectPath, gitStore.pendingBranch);
        }
        gitStore.setPendingBranch(null);
      }

      worktreePath = await resolveWorktree();
    } else {
      // Subsequent turns: process already warm, save files fire-and-forget
      docState.saveAllFiles().catch(() => {});
      worktreePath = resolveWorktreePathForSend(tabForSend, projectPath) ?? null;
    }

    // ── 4. Send the actual prompt — chat responses follow naturally ──
    try {
      const sessionId = get().tabs.find((t) => t.id === tabId)?.sessionId;
      const activeTab = get().tabs.find((t) => t.id === tabId);
      const persistedSettings = useSettingsStore.getState().settings;
      let provider = persistedSettings.aiProvider || "anthropic";
      let model = persistedSettings.aiModel ?? undefined;
      const modelKey =
        model && provider ? `${provider}/${model}` : "";
      let thoughtLevel =
        (modelKey && persistedSettings.aiModelThoughtLevels?.[modelKey]) ||
        persistedSettings.thoughtLevel ||
        undefined;

      await window.electronAPI.chatSend({
        projectPath,
        worktreePath: worktreePath || undefined,
        prompt: userPrompt,
        tabId,
        sessionId,
        apiKey: persistedSettings.aiApiKeys?.[provider] || undefined,
        baseUrl: persistedSettings.aiBaseUrls?.[provider] || undefined,
        model,
        provider,
        thoughtLevel,
        orchestratorId: composerExtras?.orchestratorId ?? activeTab?.orchestratorId ?? undefined,
        selectedExpertIds: composerExtras?.selectedExpertIds,
        mcpServerAllowlist: composerExtras?.mcpServerAllowlist,
        skillIds: composerExtras?.skillIds,
        userDisplayContent: userContent?.length
          ? (userContent as unknown as Record<string, unknown>[])
          : undefined,
        intensivePaperIds: tabBeforePrompt?.intensivePaperIds?.length
          ? tabBeforePrompt.intensivePaperIds
          : undefined,
        hasPaperSnippets: composerExtras?.hasPaperSnippets,
        promptImages: composerExtras?.promptImages?.length
          ? composerExtras.promptImages
          : undefined,
        promptFiles: composerExtras?.promptFiles?.length
          ? composerExtras.promptFiles
          : undefined,
      });
    } catch (err: any) {
      // Keep the user bubble so attachments/text aren't silently erased on failure.
      set((s) => {
        const tabs = s.tabs.map((t) => {
          if (t.id !== tabId) return t;
          return {
            ...t,
            isStreaming: false,
            error: err?.message || String(err),
          };
        });
        return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
      });
    }
  },

  cancelExecution: async () => {
    const tabId = get().activeTabId;
    const sessionId = get().tabs.find((t) => t.id === tabId)?.sessionId;
    try {
      if (sessionId) {
        await window.electronAPI.chatCancel(sessionId);
      }
    } catch (err: any) {
      console.error("[chat] Cancel failed:", err);
    }
    // Commit any partial assistant reply BEFORE clearing isStreaming. Otherwise
    // the later `chat:complete` → `_setStreaming(false)` call would treat the
    // leftover `streamingMessage` as an orphan (isStreaming already false) and
    // discard it — losing everything that streamed so far. Mark the committed
    // message `stopped: true` so the UI can show it was interrupted.
    set((s) => {
      const tabs = s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        if (t.streamingMessage) {
          const committed: ChatStreamMessage = { ...t.streamingMessage, stopped: true };
          return {
            ...t,
            isStreaming: false,
            messages: [...t.messages, committed],
            streamingMessage: null,
            streamingPartMessageId: null,
            settledStreamMessageIds: withSettledStreamMessageId(t, t.streamingPartMessageId),
          };
        }
        return { ...t, isStreaming: false };
      });
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
  },

  newSession: () => {
    const id = get().createTab();
    get().setActiveTab(id);
    syncCheckoutForTab(get().tabs.find((t) => t.id === id));
  },

  clearAllSessions: () => {
    // Full reset to initial state — new project = clean slate
    _nextTabId = 1;
    const id = nextTabId();
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
    set((s) => {
      const tabs = s.tabs.map((t) =>
        t.id === tabId ? { ...t, messages: [], streamingMessage: null, sessionId: null, sessionCwd: null, title: "New Chat", error: null, isStreaming: false, promptStale: false, isLoadingSession: false } : t,
      );
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
    void import("./checkpoint-store").then(({ useCheckpointStore }) => {
      useCheckpointStore.getState().clearTab(tabId);
    });
  },

  checkPromptStale: async (tabId?: string) => {
    const id = tabId ?? get().activeTabId;
    const tab = get().tabs.find((t) => t.id === id);
    const { useDocumentStore } = await import("./document-store");
    const projectPath = useDocumentStore.getState().projectRoot;
    if (!tab?.sessionId || !projectPath) {
      get()._setPromptStale(id, false);
      return;
    }
    try {
      const [ctx, currentFp] = await Promise.all([
        window.electronAPI.sessionGetContext(projectPath, tab.sessionId),
        window.electronAPI.settingsComputePromptFingerprint(projectPath),
      ]);
      const stale = Boolean(ctx?.promptFingerprint && ctx.promptFingerprint !== currentFp);
      get()._setPromptStale(id, stale);
    } catch {
      get()._setPromptStale(id, false);
    }
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
          streamingMessage: null,
          isStreaming: false,
          error: null,
        };
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
    if (!tab?.sessionId || !projectPath) return;
    const sessionCwd = tab.sessionCwd ?? projectPath;
    const raw = await window.electronAPI.sessionLoad(tab.sessionId, projectPath, sessionCwd);
    const filtered = await hydrateSessionMessages(raw, projectPath, tab.sessionId);
    msgCacheSet(tab.sessionId, filtered);
    set((s) => {
      const tabs = s.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              messages: filtered,
              streamingMessage: null,
              isStreaming: false,
              error: null,
            }
          : t,
      );
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
  },

  loadSession: async (sessionId: string, sessionDirectory?: string) => {
    const projectPath = useDocumentStore.getState().projectRoot || "";
    let sessionCwd = sessionDirectory ?? projectPath;
    if (!sessionDirectory && projectPath) {
      try {
        const dir = await window.electronAPI.sessionGetDirectory(sessionId);
        if (dir) sessionCwd = dir;
      } catch {
        // fall back to project root
      }
    }

    if (
      projectPath &&
      sessionCwd !== projectPath &&
      isWorktreeCheckoutPath(sessionCwd, projectPath)
    ) {
      const wtStore = useWorktreeStore.getState();
      if (!isWorktreeDirectoryActive(sessionCwd, wtStore.worktrees, projectPath)) {
        await wtStore.refreshWorktrees(projectPath);
      }
      const stillMissing = !isWorktreeDirectoryActive(
        sessionCwd,
        useWorktreeStore.getState().worktrees,
        projectPath,
      );
      if (stillMissing) {
        const onDisk = await isWorktreeCheckoutOnDisk(sessionCwd);
        if (onDisk) {
          await wtStore.refreshWorktrees(projectPath);
        } else {
          await rehomeWorktreeSessions(projectPath, sessionCwd);
          sessionCwd = projectPath;
        }
      }
    }

    const existingTab = get().tabs.find((t) => t.sessionId === sessionId);
    if (existingTab) {
      // Opening history from a blank New Chat should not leave that empty tab around.
      let nextTabs = pruneDisposableEmptyChatTabs(get().tabs, existingTab.id);
      if (sessionCwd && sessionCwd !== existingTab.sessionCwd) {
        nextTabs = nextTabs.map((t) =>
          t.id === existingTab.id ? { ...t, sessionCwd } : t,
        );
      }
      if (sessionCwd && sessionCwd !== projectPath) {
        await attachWorktreeForSessionDirectory(sessionCwd);
      } else {
        await applyCheckoutTransition({ type: "local" });
      }
      set({
        tabs: nextTabs,
        activeTabId: existingTab.id,
        ...projectActiveTab(nextTabs, existingTab.id),
      });
      syncTabSessionMapping(existingTab.id, sessionId);
      persistAndSyncIntensiveReading(sessionId, existingTab.intensivePaperIds);
      syncCitationStagingForTab(existingTab);
      void import("./terminal-ai-store").then(({ useTerminalAiStore }) => {
        useTerminalAiStore.getState().touchSessionViewed(existingTab.id);
      });
      if (existingTab.messages.length === 0 && projectPath) {
        void get().resyncTabMessagesFromDisk(existingTab.id);
      }
      return;
    }

    if (sessionCwd && sessionCwd !== projectPath) {
      await attachWorktreeForSessionDirectory(sessionCwd);
    } else {
      await applyCheckoutTransition({ type: "local" });
    }

    const newId = nextTabId();
    const tabId = newId;

    const hydrateSessionContext = () => {
      window.electronAPI.sessionGetContext(projectPath, sessionId).then((d) => {
        if (!d) return;
        useChatStore.setState((s) => {
          const tabs = s.tabs.map((t) =>
            t.id === tabId
              ? { ...t, contextTokens: d.tokens, contextBreakdown: d.breakdown, categorySchema: d.schema }
              : t,
          );
          if (s.activeTabId === tabId) {
            return {
              tabs,
              contextTokens: d.tokens,
              contextBreakdown: d.breakdown,
              categorySchema: d.schema,
            };
          }
          return { tabs };
        });
      }).catch(() => {});
    };

    const cached = msgCacheGet(sessionId);
    const storedIntensiveIds = resolveIntensivePaperIdsForSession(sessionId, []);
    if (cached) {
      // Sync hydrate from cache — avoids empty-tab flash on repeat opens.
      const title = extractSessionTitle(cached) || "New Chat";
      const hydratedTab: TabState = {
        ...makeDefaultTab(newId),
        messages: cached,
        sessionId,
        sessionCwd,
        title,
        isLoadingSession: false,
        intensivePaperIds: storedIntensiveIds,
      };
      set((s) => {
        const kept = pruneDisposableEmptyChatTabs(s.tabs);
        const tabs = [...kept, hydratedTab];
        return {
          tabs,
          activeTabId: tabId,
          ...projectActiveTab(tabs, tabId),
        };
      });
      syncTabSessionMapping(tabId, sessionId);
      persistAndSyncIntensiveReading(sessionId, storedIntensiveIds);
      void import("./checkpoint-store").then(({ useCheckpointStore }) => {
        useCheckpointStore.getState().initSession(tabId, sessionId);
      });
      hydrateSessionContext();
      syncCitationStagingForTab(hydratedTab);
      void (async () => {
        try {
          const displays = await window.electronAPI.sessionGetUserDisplays(projectPath, sessionId);
          if (!displays?.length) return;
          const enriched = applyUserDisplaySnapshots(cached, displays);
          msgCacheSet(sessionId, enriched);
          useChatStore.setState((s) => {
            const tabs = s.tabs.map((t) =>
              t.id === tabId ? { ...t, messages: enriched } : t,
            );
            return s.activeTabId === tabId
              ? { tabs, ...projectActiveTab(tabs, tabId) }
              : { tabs };
          });
        } catch { /* best-effort */ }
      })();
      return;
    }

    // Always create a new tab — never overwrite an existing one.
    // Show chat layout with loading state until history arrives from disk.
    const loadingTab: TabState = {
      ...makeDefaultTab(newId),
      sessionId,
      sessionCwd,
      isLoadingSession: true,
      intensivePaperIds: storedIntensiveIds,
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
    syncTabSessionMapping(tabId, sessionId);
    persistAndSyncIntensiveReading(sessionId, storedIntensiveIds);

    try {
      // Load all messages from the session.
      const raw: any[] = await window.electronAPI.sessionLoad(
        sessionId, projectPath, sessionCwd,
      );
      const filtered = await hydrateSessionMessages(raw, projectPath, sessionId);
      msgCacheSet(sessionId, filtered);

      const title = extractSessionTitle(filtered) || "New Chat";

      let ctxData: { tokens: number; breakdown: Record<string, number>; schema: any[] } | null = null;
      try {
        ctxData = await window.electronAPI.sessionGetContext(projectPath, sessionId);
      } catch { /* best-effort */ }

      set((s) => {
        const tabs = s.tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                messages: filtered,
                streamingMessage: null,
                title,
                sessionId,
                sessionCwd,
                error: null,
                isStreaming: false,
                isLoadingSession: false,
                contextTokens: ctxData?.tokens ?? null,
                contextBreakdown: ctxData?.breakdown ?? null,
                categorySchema: ctxData?.schema ?? null,
              }
            : t,
        );
        return { tabs, activeTabId: tabId, ...projectActiveTab(tabs, tabId) };
      });
      syncTabSessionMapping(tabId, sessionId);
      persistAndSyncIntensiveReading(sessionId, storedIntensiveIds);
      void import("./checkpoint-store").then(({ useCheckpointStore }) => {
        useCheckpointStore.getState().initSession(tabId, sessionId);
      });
      syncCitationStagingForTab({
        ...makeDefaultTab(tabId),
        messages: filtered,
        sessionId,
        sessionCwd,
        intensivePaperIds: storedIntensiveIds,
      });
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

  _appendMessage: (tabId: string, msg: ChatStreamMessage) => {
    set((s) => {
      const tabIdx = s.tabs.findIndex((t) => t.id === tabId);
      if (tabIdx === -1) return {};

      const tab = s.tabs[tabIdx];
      let msgs = tab.messages;
      let meta = tab.messageMeta;

      // Commit streaming message before appending non-assistant event
      const finalized = finalizeStreamingForMutation(tab);
      if (finalized.messages.length > tab.messages.length) {
        msgs = finalized.messages;
      }

      // Attach completion/token meta when a result arrives right after assistant
      if (msg.type === "result" && !msg.is_error && (msg.duration_ms != null || msg.usage)) {
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
        if (parts.length > 0) {
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].type === "assistant") {
              meta = { ...meta, [i]: parts.join(" · ") };
              break;
            }
          }
        }
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
        messageMeta: meta,
        streamingMessage: finalized.streamingMessage,
        title,
      };
      return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId) };
    });
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

      if (lastHasToolUse && newIsTextOrThink) {
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
    syncTabSessionMapping(tabId, sessionId);
    persistAndSyncIntensiveReading(sessionId, intensivePaperIds);
    void import("./terminal-ai-store").then(({ useTerminalAiStore }) => {
      useTerminalAiStore.getState().migrateSessionMirrorLog(tabId, sessionId);
    });
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

  _setStreaming: (tabId: string, isStreaming: boolean) => {
    set((s) => {
      const tabs = s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        if (!isStreaming) {
          if (t.isStreaming && t.streamingMessage) {
            return {
              ...t,
              isStreaming: false,
              preparePhase: null,
              messages: [...t.messages, t.streamingMessage],
              streamingMessage: null,
              streamingPartMessageId: null,
              settledStreamMessageIds: withSettledStreamMessageId(t, t.streamingPartMessageId),
            };
          }
          if (t.streamingMessage) {
            return {
              ...t,
              isStreaming: false,
              preparePhase: null,
              streamingMessage: null,
              streamingPartMessageId: null,
            };
          }
          return { ...t, isStreaming: false, preparePhase: null };
        }
        return { ...t, isStreaming: true };
      });
      // Recalculate ALL projected fields via projectActiveTab so that
      // contextTokens picks up usage from the newly committed assistant message.
      const projected = projectActiveTab(tabs, s.activeTabId);
      if (projected.contextTokens === null && s.contextTokens !== null) {
        projected.contextTokens = s.contextTokens;
      }
      return { tabs, ...projected };
    });
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

  _setContextTokens: (tabId: string, tokens: number, breakdown?: Record<string, number> | null, schema?: { key: string; label: string; color: string; description?: string; order?: number }[] | null) => {
    set((s) => {
      // Store tokens, breakdown, and schema on the TAB — survives tab switches.
      const tabs = s.tabs.map((t) =>
        t.id === tabId ? { ...t, contextTokens: tokens, contextBreakdown: breakdown ?? null, categorySchema: schema ?? null } : t,
      );
      // Also project to store-level for the active tab
      const isActive = s.activeTabId === tabId;
      if (isActive) {
        return { tabs, contextTokens: tokens, contextBreakdown: breakdown ?? null, categorySchema: schema ?? null };
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

  _injectToolResult: (tabId: string, toolUseId: string, content: string, isError = true) => {
    set((s) => {
      const tabIdx = s.tabs.findIndex((t) => t.id === tabId);
      if (tabIdx === -1) return {};

      const tab = s.tabs[tabIdx];
      const alreadyHasResult = tab.messages.some((msg) =>
        msg.message?.content?.some(
          (b) => b.type === "tool_result" && b.tool_use_id === toolUseId,
        ),
      );
      if (alreadyHasResult) return {};

      const block: ContentBlock = {
        type: "tool_result",
        tool_use_id: toolUseId,
        content,
        is_error: isError,
        status: isError ? "failed" : "completed",
      };

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
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              subAgentRuns: {
                ...t.subAgentRuns,
                [taskToolUseId]: {
                  expertId: data.expertId,
                  prompt: data.prompt,
                  status: "running",
                  subSessionId: data.subSessionId,
                  blocks: t.subAgentRuns[taskToolUseId]?.blocks ?? [],
                },
              },
            }
          : t,
      ),
    }));
  },

  _upsertSubAgentActivity: (tabId, taskToolUseId, block) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const prev = t.subAgentRuns[taskToolUseId];
        if (!prev) return t;
        return {
          ...t,
          subAgentRuns: {
            ...t.subAgentRuns,
            [taskToolUseId]: {
              ...prev,
              blocks: upsertSubAgentBlock(prev.blocks, block),
            },
          },
        };
      }),
    }));
  },

  _completeSubAgentRun: (tabId, taskToolUseId, status) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const prev = t.subAgentRuns[taskToolUseId];
        if (!prev) return t;
        return {
          ...t,
          subAgentRuns: {
            ...t.subAgentRuns,
            [taskToolUseId]: { ...prev, status },
          },
        };
      }),
    }));
  },
}));

(useChatStore as any)._msgCache = _msgCache;

import { create } from "zustand";
import type { ComposerPart } from "@/lib/chat/composer-parts";
import { useDocumentStore } from "./document-store";
import { useWorktreeStore } from "./worktree-store";
import { useGitStore } from "./git-store";
import { useSettingsStore } from "./settings-store";
import { createToolResultFromState } from "@/components/modules/chat/tools/tool-result-map";
import { truncateChatMessagesToTurn, applyUserDisplaySnapshots, isToolResultUserMessage } from "@/components/modules/chat/chat-turns";
import {
  deriveSessionTitleForSend,
  extractSessionTitle,
  isGenericSessionTitle,
} from "@/lib/chat/session-title";

// ─── Types ───

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking" | "command" | "profile";
  text?: string;
  /** Inline @file / @profile / /command tokens in user message order */
  inlineParts?: ComposerPart[];
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
}

interface TabDraft {
  /** JSON draft (`draftToJson`) or legacy plain text */
  input: string;
  /** Structured inline composer parts (preferred) */
  parts?: ComposerPart[];
  /** @deprecated legacy command chips */
  chips?: { id: string; commandName: string; action?: string; source: string }[];
  /** @deprecated legacy profile chip */
  profileChip?: { id: string; profileId: string; profileName: string } | null;
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
  /** Agent profile for this tab (null = project default). */
  activeProfileId: string | null;
  /** Chat execution mode for this tab. */
  chatMode: ChatExecutionMode;
  /** True while session history is being loaded from disk (avoids homepage flash). */
  isLoadingSession: boolean;
}

export type ChatExecutionMode = "agent" | "expert-team";

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
    isStreaming: false,
    error: null,
    draft: { input: "" },
    messageMeta: {},
    contextTokens: null,
    contextBreakdown: null,
    categorySchema: null,
    promptStale: false,
    activeProfileId: null,
    chatMode: "agent",
    isLoadingSession: false,
  };
}

/** Strip the Prism system prompt from the first user message's first text
 *  block. The system prompt is sent as a content block so it reaches the
 *  LLM, but OpenCode stores it in message history. We remove it here so
 *  users don't see system instructions in their chat history.
 *
 *  Detection strategy (order of precedence):
 *  1. Metadata flag: `hasSystemPromptBlock` from sessions-context.json
 *  2. Content heuristic: starts with "## Role" + contains Prism marker
 *  3. Size heuristic: first text block > 1000 chars while second block exists
 *     and is < 500 chars (system prompts are very long, user messages are short)
 *
 *  Only the FIRST user message is checked — system prompt is only injected
 *  on the first turn. */
function stripSystemPromptFromDisplay(
  messages: ChatStreamMessage[],
  hasSystemPromptBlock?: boolean,
): void {
  // Prism-specific markers that appear in the system prompt but never in
  // real user messages. Multiple markers avoid single-point-of-failure.
  const PRISM_MARKERS = [
    "integrated into Prism",
    "LaTeX academic paper writing workspace",
    "## Core Rules",
  ];

  for (const msg of messages) {
    if (msg.type !== "user") continue;
    const blocks = msg.message?.content;
    if (!blocks || blocks.length === 0) continue;
    const first = blocks[0];

    // Strategy 1: Metadata flag from session context (most reliable)
    let isSystemPrompt = hasSystemPromptBlock === true;

    // Strategy 2: Content-based detection (backward compat)
    if (!isSystemPrompt && first.type === "text" && first.text) {
      const text = first.text;
      if (text.startsWith("## Role")) {
        // Check for at least one Prism-specific marker
        isSystemPrompt = PRISM_MARKERS.some((m) => text.includes(m));
      }
    }

    // Strategy 3: Size heuristic — system prompts are 1000+ chars,
    // real user messages are typically shorter. Only applies when
    // there's a second block (the actual user message).
    if (!isSystemPrompt && first.type === "text" && first.text && blocks.length >= 2) {
      const second = blocks[1];
      if (
        first.text.length > 1000 &&
        second.type === "text" &&
        second.text &&
        second.text.length < 500
      ) {
        isSystemPrompt = true;
      }
    }

    if (isSystemPrompt) {
      blocks.shift();
    }
    break; // Only strip from the first user message
  }
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

  // Tab management
  createTab: () => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  saveDraft: (tabId: string, draft: TabDraft) => void;
  setActiveProfile: (tabId: string, profileId: string | null) => void;
  setChatMode: (tabId: string, mode: ChatExecutionMode) => void;

  // Chat actions
  sendPrompt: (
    userPrompt: string,
    userContent?: ContentBlock[],
    skipUserMessage?: boolean,
    profileId?: string | null,
  ) => Promise<void>;
  cancelExecution: () => Promise<void>;
  newSession: () => void;
  clearAllSessions: () => void;
  clearCurrentTab: () => void;
  loadSession: (sessionId: string) => Promise<void>;
  /** Re-check prompt fingerprint vs session for one tab (after settings edits). */
  checkPromptStale: (tabId?: string) => Promise<void>;
  /** Truncate in-memory messages (and OpenCode session via checkpoint-store) to a turn. */
  truncateToTurn: (tabId: string, turnIndex: number) => void;
  /** Restore full message list after undoing a file restore. */
  restoreMessages: (tabId: string, messages: ChatStreamMessage[]) => void;

  // Internal (called by use-opencode-events)
  _appendMessage: (tabId: string, msg: ChatStreamMessage) => void;
  _upsertLastMessage: (tabId: string, msg: ChatStreamMessage) => void;
  _setSessionId: (tabId: string, id: string) => void;
  _setTitle: (tabId: string, title: string) => void;
  _setStreaming: (tabId: string, streaming: boolean) => void;
  _setError: (tabId: string, error: string | null) => void;
  _setContextTokens: (tabId: string, tokens: number, breakdown?: Record<string, number> | null, schema?: { key: string; label: string; color: string; description?: string; order?: number }[] | null) => void;
  _setPromptStale: (tabId: string, stale: boolean) => void;
  /** Patch the input (and optionally name) of a tool_use block in committed messages or streaming message. */
  _patchToolInput: (tabId: string, toolUseId: string, input: any, name?: string) => void;
  /** Inject a synthetic tool_result when permission is denied/timed out. */
  _injectToolResult: (tabId: string, toolUseId: string, content: string, isError?: boolean) => void;
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
  if (!tab) return { messages: [] as ChatStreamMessage[], streamingMessage: null as ChatStreamMessage | null, messageMeta: {} as Record<number, string>, sessionId: null as string | null, isStreaming: false, error: null as string | null, contextTokens: null as number | null, contextBreakdown: null as Record<string, number> | null, categorySchema: null as { key: string; label: string; color: string; description?: string; order?: number }[] | null, promptStale: false, isLoadingSession: false, streamTick: 0 };

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

  setActiveTab: (id: string) => {
    const { tabs, activeTabId } = get();
    if (id === activeTabId) return;
    const targetTab = tabs.find((t) => t.id === id);
    set({
      tabs,
      activeTabId: id,
      ...projectActiveTab(tabs, id),
    });
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

  setActiveProfile: (tabId: string, profileId: string | null) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, activeProfileId: profileId } : t,
      ),
    }));
  },

  setChatMode: (tabId: string, mode: ChatExecutionMode) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, chatMode: mode } : t,
      ),
    }));
  },

  // ─── Chat Actions ───

  sendPrompt: async (
    userPrompt: string,
    userContent?: ContentBlock[],
    skipUserMessage?: boolean,
    profileIdOverride?: string | null,
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
        const base = t.streamingMessage
          ? { ...t, messages: [...t.messages, t.streamingMessage], streamingMessage: null as ChatStreamMessage | null }
          : t;
        return {
          ...base,
          title: deriveSessionTitleForSend(base, userPrompt, userContent, userMessage),
          messages: userMessage ? [...base.messages, userMessage] : base.messages,
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
        if (!wt && projectPath) {
          wt = await worktreeStore.initializeWorktree(projectPath);
          await worktreeStore.preScanWorktree(wt.name, wt.path).catch(() => {});
        }
        if (wt) {
          await docState.switchCheckoutRoot(wt.path);
        }
        return wt?.path ?? null;
      } catch {
        throw new Error("Worktree initialization failed");
      }
    };

    // ── 2. Collect agent settings from persisted settings ──
    let worktreePath: string | null = null;

    if (isFirstTurn) {
      // First turn: save files, handle branch switch, resolve worktree.
      // Pre-warm already spawned OpenCode — no progress UI needed.
      await docState.saveAllFiles();

      const gitStore = useGitStore.getState();
      const worktreeStore = useWorktreeStore.getState();
      if (gitStore.pendingBranch && gitStore.pendingBranch !== gitStore.branch) {
        if (worktreeStore.mode === "worktree") {
          worktreeStore.setMode("worktree", gitStore.pendingBranch);
        } else {
          await gitStore.switchBranch(projectPath, gitStore.pendingBranch);
        }
        gitStore.setPendingBranch(null);
      }

      worktreePath = await resolveWorktree();
    } else {
      // Subsequent turns: process already warm, save files fire-and-forget
      docState.saveAllFiles().catch(() => {});
      worktreePath = useWorktreeStore.getState().activeWorktree?.path ?? null;
    }

    // ── 4. Send the actual prompt — chat responses follow naturally ──
    try {
      const sessionId = get().tabs.find((t) => t.id === tabId)?.sessionId;
      const activeTab = get().tabs.find((t) => t.id === tabId);
      const persistedSettings = useSettingsStore.getState().settings;
      let provider = persistedSettings.aiProvider || "anthropic";
      let model = persistedSettings.aiModel ?? undefined;
      let thoughtLevel = persistedSettings.thoughtLevel || undefined;

      const effectiveProfileId = profileIdOverride ?? activeTab?.activeProfileId ?? null;

      if (effectiveProfileId && projectPath) {
        try {
          const detail = await window.electronAPI.agentGetProfileDetail(
            projectPath,
            effectiveProfileId,
          );
          if (detail?.model) {
            const slash = detail.model.indexOf("/");
            if (slash > 0) {
              provider = detail.model.slice(0, slash);
              model = detail.model.slice(slash + 1);
            }
          }
          if (detail?.thoughtLevel) thoughtLevel = detail.thoughtLevel;
        } catch {
          // use session defaults
        }
      }

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
        profileId: effectiveProfileId ?? undefined,
        userDisplayContent:
          skipUserMessage && userContent?.length
            ? (userContent as unknown as Record<string, unknown>[])
            : undefined,
      });
    } catch (err: any) {
      set((s) => {
        const tabs = s.tabs.map((t) => {
          if (t.id !== tabId) return t;
          const msgs = t.messages.filter((m, i) => !(m.type === "user" && i === t.messages.length - 1));
          return { ...t, messages: msgs, isStreaming: false, error: err?.message || String(err) };
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
      set((s) => {
        const tabs = s.tabs.map((t) =>
          t.id === tabId ? { ...t, isStreaming: false } : t,
        );
        return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
      });
    } catch (err: any) {
      console.error("[chat] Cancel failed:", err);
    }
  },

  newSession: () => {
    const id = get().createTab();
    get().setActiveTab(id);
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
        t.id === tabId ? { ...t, messages: [], streamingMessage: null, sessionId: null, title: "New Chat", error: null, isStreaming: false, promptStale: false, isLoadingSession: false } : t,
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
        if (t.sessionId) {
          const cache = (useChatStore as any)._msgCache as Map<string, ChatStreamMessage[]> | undefined;
          cache?.set(t.sessionId, messages);
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
        if (t.sessionId) {
          const cache = (useChatStore as any)._msgCache as Map<string, ChatStreamMessage[]> | undefined;
          cache?.set(t.sessionId, messages);
        }
        return { ...t, messages, streamingMessage: null, isStreaming: false, error: null };
      });
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
  },

  loadSession: async (sessionId: string) => {

    // If this session is already loaded in an existing tab, just switch to it
    const existingTab = get().tabs.find((t) => t.sessionId === sessionId);
    if (existingTab) {
      set({
        activeTabId: existingTab.id,
        ...projectActiveTab(get().tabs, existingTab.id),
      });
      void import("./terminal-ai-store").then(({ useTerminalAiStore }) => {
        useTerminalAiStore.getState().touchSessionViewed(existingTab.id);
      });
      return;
    }

    const _msgCache = (useChatStore as any)._msgCache || (
      (useChatStore as any)._msgCache = new Map<string, ChatStreamMessage[]>()
    ) as Map<string, ChatStreamMessage[]>;

    const projectPath = useDocumentStore.getState().projectRoot || "";
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

    const cached = _msgCache.get(sessionId);
    if (cached) {
      // Sync hydrate from cache — avoids empty-tab flash on repeat opens.
      const title = extractSessionTitle(cached) || "New Chat";
      const hydratedTab: TabState = {
        ...makeDefaultTab(newId),
        messages: cached,
        sessionId,
        title,
        isLoadingSession: false,
      };
      set((s) => ({
        tabs: [...s.tabs, hydratedTab],
        activeTabId: tabId,
        ...projectActiveTab([...s.tabs, hydratedTab], tabId),
      }));
      void import("./checkpoint-store").then(({ useCheckpointStore }) => {
        useCheckpointStore.getState().initSession(tabId, sessionId);
      });
      hydrateSessionContext();
      void (async () => {
        try {
          const displays = await window.electronAPI.sessionGetUserDisplays(projectPath, sessionId);
          if (!displays?.length) return;
          const enriched = applyUserDisplaySnapshots(cached, displays);
          _msgCache.set(sessionId, enriched);
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
      isLoadingSession: true,
    };
    set((s) => ({
      tabs: [...s.tabs, loadingTab],
      activeTabId: tabId,
      ...projectActiveTab([...s.tabs, loadingTab], tabId),
    }));

    try {
      const raw: any[] = await window.electronAPI.sessionLoad(sessionId, projectPath);

      // Messages can come in two formats:
      // 1. File storage: [{ info: { role }, parts: [{ type, text, ... }] }, ...]
      // 2. ACP replay:   [{ sessionUpdate, content: { type, text }, messageId }, ...]
      const messages: ChatStreamMessage[] = [];

      if (raw.length > 0 && raw[0].info && raw[0].parts) {
        for (const item of raw) {
          const blocks: ContentBlock[] = (item.parts || []).flatMap((p: any): ContentBlock[] => {
            switch (p.type) {
              case "text":
                return [{ type: "text", text: p.text || "" }];

              case "reasoning":
              case "thinking":
                return [{ type: "thinking", thinking: p.text || p.thinking || "" }];

              case "tool":
              case "tool_use": {
                const results: ContentBlock[] = [];

                const toolName: string =
                  (typeof p.tool === "string" ? p.tool : "") ||
                  p.tool?.name || p.name || "";

                const toolId: string = p.callID || p.id || "";

                const toolInput: any =
                  p.state?.input || p.input || p.tool?.input || {};

                results.push({
                  type: "tool_use",
                  id: toolId,
                  name: toolName,
                  input: toolInput,
                });

                const status = p.state?.status || "";
                const output = p.state?.output;
                const toolResult = createToolResultFromState(toolId, status, output);
                if (toolResult) {
                  results.push(toolResult);
                }
                return results;
              }

              case "tool_result":
              case "tool-result":
                return [{
                  type: "tool_result",
                  tool_use_id: p.tool_use_id || p.toolUseId || "",
                  content: p.content || p.result || "",
                  is_error: p.isError || p.is_error || false,
                }];

              default:
                return [{ type: "text", text: JSON.stringify(p) }];
            }
          }).filter((b: ContentBlock | null): b is ContentBlock => b !== null);
          const role = (item.info?.role || "user") === "user" ? "user" : "assistant";
          messages.push({ type: role as "user" | "assistant", message: { content: blocks } });
        }
      } else {
        const msgGroups = new Map<string, { role: string; blocks: ContentBlock[] }>();
        for (const chunk of raw) {
          const msgId = chunk.messageId || chunk.id || "";
          if (!msgId) continue;
          let group = msgGroups.get(msgId);
          if (!group) {
            const isUser = (chunk.sessionUpdate || "").startsWith("user_");
            group = { role: isUser ? "user" : "assistant", blocks: [] };
            msgGroups.set(msgId, group);
          }
          const content = chunk.content;
          if (!content) continue;
          const isThinking = (chunk.sessionUpdate || "") === "agent_thought_chunk";
          if (content.type === "text" && content.text) {
            const blockType = isThinking ? "thinking" : "text";
            const last = group.blocks[group.blocks.length - 1];
            if (last && last.type === blockType) {
              const key = blockType === "thinking" ? "thinking" : "text";
              (last as any)[key] = ((last as any)[key] || "") + content.text;
            } else {
              group.blocks.push(isThinking
                ? { type: "thinking" as const, thinking: content.text }
                : { type: "text" as const, text: content.text });
            }
          } else if (content.type === "tool" || content.type === "tool_use") {
            group.blocks.push({ type: "tool_use", id: chunk.id || content.id || "", name: chunk.name || content.tool?.name || content.name || "", input: chunk.input || content.tool?.input || content.input || {} });
          } else if (content.type === "tool_result" || content.type === "tool-result") {
            group.blocks.push({ type: "tool_result", tool_use_id: content.tool_use_id || content.toolUseId || "", content: content.content || content.result || "", is_error: content.isError || content.is_error || false });
          }
        }
        for (const [_, group] of Array.from(msgGroups.entries()).sort(([a], [b]) => a.localeCompare(b))) {
          messages.push({ type: group.role as "user" | "assistant", message: { content: group.blocks } });
        }
      }

      let filtered = messages.filter((m) => m.message?.content && m.message.content.length > 0);

      let ctxData: { tokens: number; breakdown: Record<string, number>; schema: any[]; hasSystemPromptBlock?: boolean } | null = null;
      try {
        ctxData = await window.electronAPI.sessionGetContext(projectPath, sessionId);
      } catch { /* best-effort */ }

      stripSystemPromptFromDisplay(filtered, ctxData?.hasSystemPromptBlock);

      try {
        const displays = await window.electronAPI.sessionGetUserDisplays(projectPath, sessionId);
        if (displays?.length) {
          filtered = applyUserDisplaySnapshots(filtered, displays);
        }
      } catch { /* best-effort */ }

      _msgCache.set(sessionId, filtered);

      const title = extractSessionTitle(messages) || "New Chat";

      set((s) => {
        const tabs = s.tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                messages: filtered,
                streamingMessage: null,
                title,
                sessionId,
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
      void import("./checkpoint-store").then(({ useCheckpointStore }) => {
        useCheckpointStore.getState().initSession(tabId, sessionId);
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
      if (tab.streamingMessage) {
        msgs = [...msgs, tab.streamingMessage];
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
      newTabs[tabIdx] = { ...tab, messages: msgs, messageMeta: meta, streamingMessage: null, title };
      return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId) };
    });
  },

  _upsertLastMessage: (tabId: string, msg: ChatStreamMessage) => {
    set((s) => {
      const tabIdx = s.tabs.findIndex((t) => t.id === tabId);
      if (tabIdx === -1) return {};

      const tab = s.tabs[tabIdx];
      const prev = tab.streamingMessage;
      const streamTick = ((s as any).streamTick || 0) + 1;

      // No existing streaming message — set as first
      if (!prev) {
        const newTabs = [...s.tabs];
        newTabs[tabIdx] = { ...tab, streamingMessage: msg };
        return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId), streamTick };
      }

      // Merge content blocks: the parser emits full accumulated state on each
      // delta, so new blocks replace old blocks of the same category.
      // Exception: tool_use → text/thinking transition means a new turn started —
      // commit the previous streaming message (preserving tool_use blocks) and
      // start a fresh one.

      const oldBlocks = prev.message?.content || [];
      const newBlocks = msg.message?.content || [];

      // ── Progress → real boundary ──
      // When the streaming message has a _progress thinking block and new content
      // has real (non-_progress) text or thinking, commit the progress block to
      // history and start a fresh streaming message for the real AI response.
      const oldHasProgressThinking = oldBlocks.some(
        (b) => b.type === "thinking" && (b as ContentBlock)._progress
      );
      const newHasRealContent = newBlocks.some(
        (b) => (b.type === "text" || b.type === "thinking") && !(b as ContentBlock)._progress
      );

      if (oldHasProgressThinking && newHasRealContent) {
        const newTabs = [...s.tabs];
        newTabs[tabIdx] = {
          ...tab,
          messages: [...tab.messages, prev], // commit progress thinking to history
          streamingMessage: msg,              // start real AI streaming
        };
        return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId), streamTick };
      }

      const lastHasToolUse = oldBlocks.some((b) => b.type === "tool_use");
      const newIsTextOrThink = newBlocks.every((b) => b.type === "text" || b.type === "thinking");

      if (lastHasToolUse && newIsTextOrThink) {
        // Cross-turn boundary: commit old (with tool_use), start new
        const newTabs = [...s.tabs];
        newTabs[tabIdx] = {
          ...tab,
          messages: [...tab.messages, prev],
          streamingMessage: msg,
        };
        return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId), streamTick };
      }

      // Same turn: dedup blocks by type/id — keep latest version of each.
      // O(n+m) via pre-computed sets instead of O(n*m) inner `.some()` loops.
      const newTypes = new Set(newBlocks.map((nb) => nb.type));
      const newToolIds = new Set(newBlocks.filter((nb) => nb.type === "tool_use" && nb.id).map((nb) => nb.id));
      const preserved = oldBlocks.filter((b) => {
        if (b.type === "text" && newTypes.has("text")) return false;
        if (b.type === "thinking" && newTypes.has("thinking")) return false;
        if (b.type === "tool_use" && b.id && newToolIds.has(b.id)) return false;
        return true;
      });

      const merged: ChatStreamMessage = {
        ...msg,
        message: { ...msg.message, content: [...preserved, ...newBlocks] },
      };

      const newTabs = [...s.tabs];
      newTabs[tabIdx] = { ...tab, streamingMessage: merged };
      return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId), streamTick };
    });
  },

  _setSessionId: (tabId: string, sessionId: string) => {
    set((s) => {
      const tabs = s.tabs.map((t) =>
        t.id === tabId ? { ...t, sessionId } : t,
      );
      const activeTab = tabs.find((t) => t.id === s.activeTabId);
      return { tabs, sessionId: activeTab?.sessionId ?? null };
    });
    void import("./terminal-ai-store").then(({ useTerminalAiStore }) => {
      useTerminalAiStore.getState().migrateSessionMirrorLog(tabId, sessionId);
    });
  },

  _setTitle: (tabId: string, title: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
    }));
  },

  _setStreaming: (tabId: string, isStreaming: boolean) => {
    set((s) => {
      const tabs = s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        if (!isStreaming && t.streamingMessage) {
          return {
            ...t,
            isStreaming: false,
            messages: [...t.messages, t.streamingMessage],
            streamingMessage: null,
          };
        }
        return { ...t, isStreaming };
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
}));

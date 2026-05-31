import { create } from "zustand";
import { useDocumentStore } from "./document-store";
import { useAgentSettingsStore } from "./agent-settings-store";

// ─── Types ───

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking";
  text?: string;
  id?: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  content?: any;
  is_error?: boolean;
  thinking?: string;
  duration?: number; // thinking duration in seconds (cached for old sessions)
  signature?: string;
}

export interface ChatStreamMessage {
  type: "system" | "assistant" | "user" | "result";
  subtype?: string;
  session_id?: string;
  message?: {
    content?: ContentBlock[];
    usage?: { input_tokens: number; output_tokens: number };
  };
  usage?: { input_tokens: number; output_tokens: number };
  cost_usd?: number;
  duration_ms?: number;
  result?: string;
  is_error?: boolean;
  num_turns?: number;
}

interface TabDraft {
  input: string;
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
    isStreaming: false,
    error: null,
    draft: { input: "" },
    messageMeta: {},
  };
}

/** Extract session title from the first user message (same logic as listClaudeSessions). */
function extractSessionTitle(messages: ChatStreamMessage[]): string | null {
  for (const msg of messages) {
    if (msg.type !== "user") continue;
    const blocks = msg.message?.content;
    if (!blocks || blocks.length === 0) continue;

    const text = blocks
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join(" ");

    if (!text) continue;

    const cleaned = text
      .replace(/<[^>]+>/g, "")
      .replace(/^\[Currently open file:.*?\]\n?\n?/, "")
      .trim();

    if (cleaned) return cleaned.slice(0, 40);
  }
  return null;
}

interface ChatState {
  selectedAgent: string;

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

  // Tab management
  createTab: () => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  saveDraft: (tabId: string, draft: TabDraft) => void;

  // Chat actions
  sendPrompt: (userPrompt: string) => Promise<void>;
  cancelExecution: () => Promise<void>;
  newSession: () => void;
  clearAllSessions: () => void;
  clearCurrentTab: () => void;
  loadSession: (sessionId: string) => Promise<void>;

  // Settings
  setSelectedAgent: (agentId: string) => void;

  // Internal (called by use-cli-events)
  _appendMessage: (tabId: string, msg: ChatStreamMessage) => void;
  _upsertLastMessage: (tabId: string, msg: ChatStreamMessage) => void;
  _setSessionId: (tabId: string, id: string) => void;
  _setStreaming: (tabId: string, streaming: boolean) => void;
  _setError: (tabId: string, error: string | null) => void;
}

function projectActiveTab(tabs: TabState[], activeTabId: string) {
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return { messages: [], streamingMessage: null, messageMeta: {}, sessionId: null, isStreaming: false, error: null };
  return {
    messages: tab.messages,
    streamingMessage: tab.streamingMessage,
    messageMeta: tab.messageMeta,
    sessionId: tab.sessionId,
    isStreaming: tab.isStreaming,
    error: tab.error,
  };
}

// ─── Store ───

const initialTabId = nextTabId();
const initialTab = makeDefaultTab(initialTabId);

export const useChatStore = create<ChatState>()((set, get) => ({
  selectedAgent: "claude",

  // Multi-tab
  tabs: [initialTab],
  activeTabId: initialTabId,

  // Projected
  ...projectActiveTab([initialTab], initialTabId),
  messageMeta: {} as Record<number, string>,

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
    set({
      tabs: newTabs,
      activeTabId: newActiveId,
      ...projectActiveTab(newTabs, newActiveId),
    });

      // Clean up agent session for this tab — cancel any running prompt then kill process
      window.electronAPI.cliCancel(id).catch(() => {});
      window.electronAPI.cliCloseSession(id).catch(() => {});
  },

  setActiveTab: (id: string) => {
    const { tabs, activeTabId } = get();
    if (id === activeTabId) return;
    set({
      activeTabId: id,
      ...projectActiveTab(tabs, id),
    });
  },

  saveDraft: (tabId: string, draft: TabDraft) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, draft } : t)),
    }));
  },

  // ─── Chat Actions ───

  sendPrompt: async (userPrompt: string) => {
    const docState = useDocumentStore.getState();
    const projectPath = docState.projectRoot || "";

    // Check if agent is available
    try {
      const status = await window.electronAPI.cliStatus();
      if (!status.available) {
        set((s) => {
          const tabs = s.tabs.map((t) =>
            t.id === s.activeTabId ? { ...t, error: status.error || "Agent not available." } : t,
          );
          return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
        });
        return;
      }
    } catch (err: any) {
      set((s) => {
        const tabs = s.tabs.map((t) =>
          t.id === s.activeTabId ? { ...t, error: `Status check failed: ${err?.message}` } : t,
        );
        return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
      });
      return;
    }

    await docState.saveAllFiles();

    const userMessage: ChatStreamMessage = {
      type: "user",
      message: { content: [{ type: "text", text: userPrompt }] },
    };

    const tabId = get().activeTabId;
    const agentId = get().selectedAgent;
    // Set title from first prompt
    set((s) => {
      const tabs = s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        // Commit any leftover streaming message before starting a new turn
        const base = t.streamingMessage
          ? { ...t, messages: [...t.messages, t.streamingMessage], streamingMessage: null as ChatStreamMessage | null }
          : t;
        return {
          ...base,
          title: base.messages.length === 0 ? userPrompt.slice(0, 40) : t.title,
          messages: [...base.messages, userMessage],
          isStreaming: true,
          error: null,
        };
      });
      return {
        tabs,
        ...projectActiveTab(tabs, s.activeTabId),
      };
    });

    try {
      const agentSettings = useAgentSettingsStore.getState();
      const sessionId = get().tabs.find((t) => t.id === tabId)?.sessionId;
      await window.electronAPI.cliSend({
        projectPath,
        prompt: userPrompt,
        tabId,
        agent: agentId,
        model: agentSettings.getSetting("model"),
        sessionId,
      });
    } catch (err: any) {
      set((s) => {
        const tabs = s.tabs.map((t) => {
          if (t.id !== tabId) return t;
          // Remove the user message that was just added — don't leave orphaned messages
          const msgs = t.messages.filter((m, i) => !(m.type === "user" && i === t.messages.length - 1));
          return { ...t, messages: msgs, isStreaming: false, error: err?.message || String(err) };
        });
        return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
      });
    }
  },

  cancelExecution: async () => {
    const tabId = get().activeTabId;
    try {
      await window.electronAPI.cliCancel(tabId);
      set((s) => {
        const tabs = s.tabs.map((t) =>
          t.id === tabId ? { ...t, isStreaming: false } : t,
        );
        return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
      });
    } catch (err: any) {
      console.error("[claude-chat] Cancel failed:", err);
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
        t.id === tabId ? { ...t, messages: [], streamingMessage: null, sessionId: null, title: "New Chat", error: null, isStreaming: false } : t,
      );
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
  },

  loadSession: async (sessionId: string) => {
    const projectPath = useDocumentStore.getState().projectRoot || "";

    // If this session is already loaded in an existing tab, just switch to it
    const existingTab = get().tabs.find((t) => t.sessionId === sessionId);
    if (existingTab) {
      set({
        activeTabId: existingTab.id,
        ...projectActiveTab(get().tabs, existingTab.id),
      });
      return;
    }

    // Always create a new tab — never overwrite an existing one.
    // This preserves in-memory data (result messages, meta) on the current tab.
    const newId = nextTabId();
    const newTab = makeDefaultTab(newId);
    const tabId = newId;
    // Switch to the new tab IMMEDIATELY so the UI responds instantly.
    // Messages load async below and populate when ready.
    set((s) => ({
      tabs: [...s.tabs, newTab],
      activeTabId: tabId,
      ...projectActiveTab([...s.tabs, newTab], tabId),
    }));

    try {
      const raw = await window.electronAPI.cliLoadSession(projectPath, sessionId);
      const messages = raw.filter((msg: ChatStreamMessage) => {
        if (msg.type === "system") return false;
        // Keep result messages even without content — they carry
        // duration_ms and usage needed for completion display.
        if (msg.type === "result") return true;
        if (!msg.message?.content || msg.message.content.length === 0) return false;
        return true;
      });
      // Build messageMeta from loaded messages (result → preceding assistant)
      const meta: Record<number, string> = {};
      for (let i = 0; i < messages.length - 1; i++) {
        const msg = messages[i];
        const next = messages[i + 1];
        if (msg.type === "assistant" && next.type === "result" && !next.is_error) {
          const parts: string[] = [];
          const ms = next.duration_ms;
          if (ms != null) {
            parts.push(`Completed in ${(ms / 1000).toFixed(1)}s`);
          }
          // usage may be at top level (live) or inside message (JSONL)
          const usage = next.usage || next.message?.usage;
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
            meta[i] = parts.join(" · ");
          }
        }
      }
      const title = extractSessionTitle(messages) || "New Chat";
      set((s) => {
        const tabs = s.tabs.map((t) =>
          t.id === tabId
            ? { ...t, messages, streamingMessage: null, title, sessionId, error: null, isStreaming: false, messageMeta: meta }
            : t,
        );
        return { tabs, activeTabId: tabId, ...projectActiveTab(tabs, tabId) };
      });
    } catch (err: any) {
      set((s) => {
        const tabs = s.tabs.map((t) =>
          t.id === tabId
            ? { ...t, error: `Failed to load session: ${err?.message || String(err)}` }
            : t,
        );
        return { tabs, activeTabId: tabId, ...projectActiveTab(tabs, tabId) };
      });
    }
  },

  // ─── Settings ───

  setSelectedAgent: (selectedAgent) => set({ selectedAgent }),

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

      const newTabs = [...s.tabs];
      newTabs[tabIdx] = { ...tab, messages: msgs, messageMeta: meta, streamingMessage: null };
      return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId) };
    });
  },

  _upsertLastMessage: (tabId: string, msg: ChatStreamMessage) => {
    set((s) => {
      const tabIdx = s.tabs.findIndex((t) => t.id === tabId);
      if (tabIdx === -1) return {};

      const tab = s.tabs[tabIdx];
      const prev = tab.streamingMessage;

      // No existing streaming message — set as first
      if (!prev) {
        const newTabs = [...s.tabs];
        newTabs[tabIdx] = { ...tab, streamingMessage: msg };
        return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId) };
      }

      // Merge content blocks: the parser emits full accumulated state on each
      // delta, so new blocks replace old blocks of the same category.
      // Exception: tool_use → text/thinking transition means a new turn started —
      // commit the previous streaming message (preserving tool_use blocks) and
      // start a fresh one.
      const oldBlocks = prev.message?.content || [];
      const newBlocks = msg.message?.content || [];
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
        return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId) };
      }

      // Same turn: dedup blocks by type/id — keep latest version of each
      const preserved = oldBlocks.filter((b) => {
        if (b.type === "text" && newBlocks.some((nb) => nb.type === "text")) return false;
        if (b.type === "thinking" && newBlocks.some((nb) => nb.type === "thinking")) return false;
        if (b.type === "tool_use" && b.id && newBlocks.some((nb) => nb.type === "tool_use" && nb.id === b.id)) return false;
        return true;
      });

      const merged: ChatStreamMessage = {
        ...msg,
        message: { ...msg.message, content: [...preserved, ...newBlocks] },
      };

      const newTabs = [...s.tabs];
      newTabs[tabIdx] = { ...tab, streamingMessage: merged };
      return { tabs: newTabs, ...projectActiveTab(newTabs, s.activeTabId) };
    });
  },

  _setSessionId: (tabId: string, sessionId: string) => {
    set((s) => {
      const tabs = s.tabs.map((t) =>
        t.id === tabId ? { ...t, sessionId } : t,
      );
      // Only update the sessionId projected field — don't touch messages etc.
      const activeTab = tabs.find((t) => t.id === s.activeTabId);
      return { tabs, sessionId: activeTab?.sessionId ?? null };
    });
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
      // Project only affected fields: messages/streamingMessage may have changed
      // (when streaming stops), isStreaming always changes for the target tab.
      const activeTab = tabs.find((t) => t.id === s.activeTabId);
      return {
        tabs,
        isStreaming: activeTab?.isStreaming ?? false,
        ...(activeTab ? {
          messages: activeTab.messages,
          streamingMessage: activeTab.streamingMessage,
        } : {}),
      };
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
}));

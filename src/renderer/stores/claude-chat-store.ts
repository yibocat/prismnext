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

export interface ClaudeStreamMessage {
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
  messages: ClaudeStreamMessage[];
  isStreaming: boolean;
  error: string | null;
  draft: TabDraft;
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
    isStreaming: false,
    error: null,
    draft: { input: "" },
  };
}

interface ClaudeChatState {
  selectedAgent: string;

  // Multi-tab state
  tabs: TabState[];
  activeTabId: string;

  // Projected fields (from active tab) — for backward compat
  messages: ClaudeStreamMessage[];
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

  // Internal (called by use-claude-events)
  _appendMessage: (tabId: string, msg: ClaudeStreamMessage) => void;
  _upsertLastMessage: (tabId: string, msg: ClaudeStreamMessage) => void;
  _setSessionId: (tabId: string, id: string) => void;
  _setStreaming: (tabId: string, streaming: boolean) => void;
  _setError: (tabId: string, error: string | null) => void;
}

function projectActiveTab(tabs: TabState[], activeTabId: string) {
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return { messages: [], sessionId: null, isStreaming: false, error: null };
  return {
    messages: tab.messages,
    sessionId: tab.sessionId,
    isStreaming: tab.isStreaming,
    error: tab.error,
  };
}

// ─── Store ───

const initialTabId = nextTabId();
const initialTab = makeDefaultTab(initialTabId);

export const useClaudeChatStore = create<ClaudeChatState>()((set, get) => ({
  selectedAgent: "claude",

  // Multi-tab
  tabs: [initialTab],
  activeTabId: initialTabId,

  // Projected
  ...projectActiveTab([initialTab], initialTabId),

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
      window.electronAPI.agentCancel(id).catch(() => {});
      window.electronAPI.agentCloseSession(id).catch(() => {});
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
      const status = await window.electronAPI.agentStatus();
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

    const userMessage: ClaudeStreamMessage = {
      type: "user",
      message: { content: [{ type: "text", text: userPrompt }] },
    };

    const tabId = get().activeTabId;
    const agentId = get().selectedAgent;
    // Set title from first prompt
    set((s) => {
      const tabs = s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        return {
          ...t,
          title: t.messages.length === 0 ? userPrompt.slice(0, 40) : t.title,
          messages: [...t.messages, userMessage],
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
      const sessionId = get().tabs.find((t) => t.id === tabId)?.sessionId;
      const agentSettings = useAgentSettingsStore.getState();
      await window.electronAPI.agentSend(
        projectPath, userPrompt, tabId, agentId, sessionId ?? undefined,
        agentSettings.getSetting("model"), agentSettings.getSetting("agentMode"), agentSettings.getSetting("effort")
      );
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
      await window.electronAPI.agentCancel(tabId);
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
        t.id === tabId ? { ...t, messages: [], sessionId: null, title: "New Chat", error: null, isStreaming: false } : t,
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

    // Find a suitable tab to load this session into:
    // 1. Prefer the current tab if it's not streaming
    // 2. Otherwise find any non-streaming tab
    // 3. If all tabs are streaming, create a new tab
    // NEVER cancel a running agent — they must run independently.
    const tabs = get().tabs;
    const activeId = get().activeTabId;
    const activeTab = tabs.find((t) => t.id === activeId);
    let targetTab = activeTab && !activeTab.isStreaming ? activeTab : tabs.find((t) => !t.isStreaming);
    if (!targetTab) {
      const newId = nextTabId();
      const newTab = makeDefaultTab(newId);
      targetTab = { ...newTab, id: newId };
      set((s) => ({ tabs: [...s.tabs, targetTab!] }));
    }
    const tabId = targetTab.id;

    try {
      const raw = await window.electronAPI.agentLoadSession(projectPath, sessionId);
      const messages = raw.filter((msg: ClaudeStreamMessage) => {
        if (msg.type === "system") return false;
        if (!msg.message?.content || msg.message.content.length === 0) return false;
        return true;
      });
      set((s) => {
        const tabs = s.tabs.map((t) =>
          t.id === tabId
            ? { ...t, messages, sessionId, error: null, isStreaming: false }
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

  _appendMessage: (tabId: string, msg: ClaudeStreamMessage) => {
    set((s) => {
      const tabExists = s.tabs.some((t) => t.id === tabId);
      if (!tabExists) return {};
      const tabs = s.tabs.map((t) =>
        t.id === tabId ? { ...t, messages: [...t.messages, msg] } : t,
      );
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
  },

  _upsertLastMessage: (tabId: string, msg: ClaudeStreamMessage) => {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId);
      if (!tab) return {};

      const msgs = [...tab.messages];
      const last = msgs[msgs.length - 1];

      // Merge content blocks for assistant messages (preserve thinking/tool_use).
      // But: if the last message has tool_use blocks and the new blocks are text/thinking,
      // append as a new message to keep tool_use visually separate from follow-up text.
      if (last?.type === msg.type && last.type === "assistant") {
        const oldBlocks = last.message?.content || [];
        const newBlocks = msg.message?.content || [];
        const lastHasToolUse = oldBlocks.some((b) => b.type === "tool_use");
        const newIsTextOrThink = newBlocks.every((b) => b.type === "text" || b.type === "thinking");

        if (lastHasToolUse && newIsTextOrThink) {
          msgs.push(msg);
        } else {
          // Remove old blocks that are being replaced by new ones of same category
          const preserved = oldBlocks.filter((b) => {
            if (b.type === "text" && newBlocks.some((nb) => nb.type === "text")) return false;
            if (b.type === "thinking" && newBlocks.some((nb) => nb.type === "thinking")) return false;
            return true;
          });

          msgs[msgs.length - 1] = {
            ...msg,
            message: { ...msg.message, content: [...preserved, ...newBlocks] },
          };
        }
      } else if (last?.type === "result" && msg.type === "result") {
        msgs[msgs.length - 1] = msg;
      } else {
        msgs.push(msg);
      }

      const tabs = s.tabs.map((t) =>
        t.id === tabId ? { ...t, messages: msgs } : t,
      );
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
  },

  _setSessionId: (tabId: string, sessionId: string) => {
    set((s) => {
      const tabs = s.tabs.map((t) =>
        t.id === tabId ? { ...t, sessionId } : t,
      );
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
  },

  _setStreaming: (tabId: string, isStreaming: boolean) => {
    set((s) => {
      const tabs = s.tabs.map((t) =>
        t.id === tabId ? { ...t, isStreaming } : t,
      );
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
  },

  _setError: (tabId: string, error: string | null) => {
    set((s) => {
      const tabs = s.tabs.map((t) =>
        t.id === tabId ? { ...t, error } : t,
      );
      return { tabs, ...projectActiveTab(tabs, s.activeTabId) };
    });
  },
}));

import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";
import { findOpenAiTabForChat } from "@/lib/terminal/ai-session";
import {
  formatAiTerminalStatus,
  resolveAiTerminalViewMode,
  type AiTerminalPhase,
  type AiTerminalViewMode,
} from "@/lib/terminal/ai-terminal-lifecycle";
import { resolveAiMirrorKey } from "@/lib/terminal/mirror-key";
import { shellDisplayName, defaultUserTerminalTitle } from "@/lib/terminal/shell-label";

export interface TerminalSidebarAiItem {
  key: string;
  chatTabId: string;
  aiTabId?: string;
  title: string;
  phase: AiTerminalPhase;
  viewMode: AiTerminalViewMode;
  statusLabel: string;
  command?: string;
  pinned?: boolean;
  isActiveTab: boolean;
}

export interface TerminalSidebarUserItem {
  tabId: string;
  title: string;
  shellLabel: string;
  status: string;
  busy: boolean;
  lastCommand?: string;
  isActiveTab: boolean;
}

function resolveAiViewMode(phase: AiTerminalPhase): AiTerminalViewMode {
  const agentMode = useSettingsStore.getState().settings.agentTerminalMode ?? "pty";
  return resolveAiTerminalViewMode(agentMode, phase);
}

export function collectTerminalSidebarAiItems(activeTabId: string | null): TerminalSidebarAiItem[] {
  const tabs = useRightPanelStore.getState().tabs;
  const chatTabs = useChatStore.getState().tabs;
  const sessionStates = useTerminalAiStore.getState().sessionStates;
  const seen = new Set<string>();
  const items: TerminalSidebarAiItem[] = [];

  const chatTitle = (chatTabId: string) =>
    chatTabs.find((t) => t.id === chatTabId)?.title?.trim() || "Chat session";

  for (const tab of tabs) {
    if (tab.kind !== "terminal" || tab.terminalSource !== "ai") continue;
    const chatTabId = tab.linkedChatTabId;
    if (!chatTabId) continue;
    const key = resolveAiMirrorKey(chatTabId);
    if (seen.has(key)) continue;
    seen.add(key);
    const state = sessionStates[key];
    const phase = state?.phase ?? "completed";
    items.push({
      key,
      chatTabId,
      aiTabId: tab.id,
      title: tab.title || `AI · ${chatTitle(chatTabId)}`,
      phase,
      viewMode: resolveAiViewMode(phase),
      statusLabel: formatAiTerminalStatus(state) ?? "AI terminal",
      command: state?.activeCommand,
      pinned: state?.pinned,
      isActiveTab: tab.id === activeTabId,
    });
  }

  for (const state of Object.values(sessionStates)) {
    if (state.phase !== "running") continue;
    if (seen.has(state.sessionId)) continue;
    const openId = findOpenAiTabForChat(state.chatTabId);
    if (openId) continue;
    seen.add(state.sessionId);
    items.push({
      key: state.sessionId,
      chatTabId: state.chatTabId,
      title: `AI · ${chatTitle(state.chatTabId)}`,
      phase: state.phase,
      viewMode: resolveAiViewMode(state.phase),
      statusLabel: formatAiTerminalStatus(state) ?? "AI terminal",
      command: state.activeCommand,
      pinned: state.pinned,
      isActiveTab: false,
    });
  }

  items.sort((a, b) => {
    const rank = (p: AiTerminalPhase) => (p === "running" ? 0 : 1);
    const d = rank(a.phase) - rank(b.phase);
    if (d !== 0) return d;
    return a.title.localeCompare(b.title);
  });

  return items;
}

export function partitionAiSidebarItems(items: TerminalSidebarAiItem[]): {
  live: TerminalSidebarAiItem[];
  saved: TerminalSidebarAiItem[];
} {
  const live = items.filter((i) => i.phase === "running");
  const saved = items.filter((i) => i.phase !== "running" && i.aiTabId);
  return { live, saved };
}

export function collectTerminalSidebarUserItems(activeTabId: string | null): TerminalSidebarUserItem[] {
  const tabs = useRightPanelStore.getState().tabs;
  const sessions = useTerminalStore.getState().sessions;
  const envShell = useTerminalStore.getState().envInfo?.shell;

  return tabs
    .filter((t) => t.kind === "terminal" && t.terminalSource !== "ai")
    .map((tab) => {
      const session = sessions[tab.id];
      const shellLabel = shellDisplayName(session?.shell || envShell);
      return {
        tabId: tab.id,
        title: tab.title || shellLabel || defaultUserTerminalTitle(envShell),
        shellLabel,
        status: session?.status ?? "unknown",
        busy: session?.busy === true,
        lastCommand: session?.lastCommand,
        isActiveTab: tab.id === activeTabId,
      };
    });
}

export function countActiveTerminalActivity(): {
  aiRunning: number;
  aiOpen: number;
  userBusy: number;
} {
  const sessionStates = useTerminalAiStore.getState().sessionStates;
  const aiRunning = Object.values(sessionStates).filter((s) => s.phase === "running").length;
  const aiOpen = useRightPanelStore.getState().tabs.filter(
    (t) => t.kind === "terminal" && t.terminalSource === "ai",
  ).length;
  const userBusy = Object.values(useTerminalStore.getState().sessions).filter((s) => s.busy).length;
  return { aiRunning, aiOpen, userBusy };
}

import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useExecutionStore } from "@/stores/execution-store";
import { findOpenAiTabForChat } from "@/lib/terminal/ai-session";
import { isJobMonitorTab } from "@/lib/workspace/mode-registry";
import { terminalExecutionIsFinal } from "../../../shared/execution";
import {
  formatAiTerminalStatus,
  resolveAiTerminalViewMode,
  type AiTerminalPhase,
  type AiTerminalViewMode,
} from "@/lib/terminal/ai-terminal-lifecycle";
import { resolveAiMirrorKey } from "@/lib/terminal/mirror-key";
import { shellDisplayName, defaultUserTerminalTitle } from "@/lib/terminal/shell-label";

export interface TerminalSidebarJobItem {
  key: string;
  executionId: string;
  tabId?: string;
  title: string;
  state: string;
  statusLabel: string;
  command?: string;
  origin?: string;
  pinned?: boolean;
  isActiveTab: boolean;
}

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

export function collectTerminalSidebarJobItems(activeTabId: string | null): TerminalSidebarJobItem[] {
  const tabs = useRightPanelStore.getState().tabs;
  const byId = useExecutionStore.getState().byId;
  const pinned = useExecutionStore.getState().pinned;
  const items: TerminalSidebarJobItem[] = [];
  const seen = new Set<string>();

  for (const tab of tabs) {
    if (!isJobMonitorTab(tab)) continue;
    const executionId = tab.linkedExecutionId;
    const chatJobs = tab.linkedChatTabId
      ? useExecutionStore.getState().listForChat(tab.linkedChatTabId)
      : [];
    for (const job of chatJobs) {
      if (job.summary?.executionId) seen.add(job.summary.executionId);
    }
    if (executionId) {
      if (seen.has(executionId) && chatJobs.length === 0) continue;
      seen.add(executionId);
      const live = chatJobs.find((job) => job.summary && !terminalExecutionIsFinal(job.summary.state));
      const latest = chatJobs[chatJobs.length - 1];
      const summary = live?.summary ?? latest?.summary ?? byId[executionId]?.summary;
      const state = summary?.state ?? "completed";
      items.push({
        key: tab.linkedChatTabId || executionId,
        executionId: summary?.executionId || executionId,
        tabId: tab.id,
        title: tab.title || summary?.command || "Job",
        state,
        statusLabel: state,
        command: summary?.command,
        origin: summary?.origin,
        pinned: Boolean(pinned[executionId]),
        isActiveTab: tab.id === activeTabId,
      });
      continue;
    }
    items.push({
      key: tab.id,
      executionId: "",
      tabId: tab.id,
      title: tab.title || "Job",
      state: "completed",
      statusLabel: "completed",
      isActiveTab: tab.id === activeTabId,
    });
  }

  for (const [executionId, view] of Object.entries(byId)) {
    const summary = view.summary;
    if (!summary || seen.has(executionId) || terminalExecutionIsFinal(summary.state)) continue;
    seen.add(executionId);
    items.push({
      key: executionId,
      executionId,
      title: summary.command || "Job",
      state: summary.state,
      statusLabel: summary.state,
      command: summary.command,
      origin: summary.origin,
      pinned: Boolean(pinned[executionId]),
      isActiveTab: false,
    });
  }

  items.sort((a, b) => {
    const rank = (state: string) => (state === "running" || state === "starting" ? 0 : 1);
    const d = rank(a.state) - rank(b.state);
    if (d !== 0) return d;
    return a.title.localeCompare(b.title);
  });
  return items;
}

export function partitionJobSidebarItems(items: TerminalSidebarJobItem[]): {
  live: TerminalSidebarJobItem[];
  saved: TerminalSidebarJobItem[];
} {
  const live = items.filter((item) => item.state === "running" || item.state === "starting" || item.state === "cancel-requested");
  const saved = items.filter((item) => !live.includes(item) && item.tabId);
  return { live, saved };
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
    .filter((t) => t.kind === "terminal" && !isJobMonitorTab(t))
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
  const jobRunning = Object.values(useExecutionStore.getState().byId).filter(
    (view) => view.summary && !terminalExecutionIsFinal(view.summary.state),
  ).length;
  const aiOpen = useRightPanelStore.getState().tabs.filter((t) => isJobMonitorTab(t)).length;
  const userBusy = Object.values(useTerminalStore.getState().sessions).filter((s) => s.busy).length;
  return { aiRunning: Math.max(aiRunning, jobRunning), aiOpen, userBusy };
}

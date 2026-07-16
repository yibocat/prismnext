import { create } from "zustand";
import { useDocumentStore } from "./document-store";
import { useLayoutStore } from "./layout-store";
import { useTerminalStore } from "./terminal-store";
import { shellDisplayName } from "@/lib/terminal/shell-label";
import { useTerminalAiStore } from "./terminal-ai-store";
import { modeRegistry, type RightTabKind, type RightTab } from "@/lib/workspace/mode-registry";
import { getTabCloseConfirmation, getBatchTabCloseConfirmation } from "@/lib/workspace/tab-close-confirmation";
import {
  buildInitialTabShell,
  getExperimentsTabCloseAction,
  getLiteratureTabCloseAction,
} from "@/lib/workspace/tab-lifecycle";
import { useTabCloseConfirmStore } from "@/stores/tab-close-confirm-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useChatStore } from "@/stores/chat-store";
import { deactivateModeByTabKind } from "@/lib/workspace/deactivate-mode";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import { settingsPanelSlotKey } from "@/lib/settings/settings-panel-slot-key";
import { settingsPanelSlotTitle } from "@/lib/settings/settings-panel-slots";

// ─── Re-exports ───

export type { RightTabKind, RightTab } from "@/lib/workspace/mode-registry";

// ─── Helpers ───

let _tabSeq = 0;
function nextTabId(): string {
  return `right-tab-${++_tabSeq}`;
}

// ─── Store ───

interface RightPanelState {
  tabs: RightTab[];
  activeTabId: string | null;

  ensureTab: (kind: RightTabKind) => string;
  openLiteraturePaper: (paperId: string, title: string, view?: "grid" | "reader" | "notes") => string;
  /** Open / focus a detail tab for one experiment (browse home tab stays). */
  openExperimentTab: (experimentId: string, title: string) => string;
  /** Remove detail tabs for a deleted experiment id. */
  closeExperimentTabs: (experimentId: string) => void;
  /** Activate the Experiments home (browse grid) tab. */
  activateExperimentsHomeTab: () => string;
  /** Create/activate a terminal tab whose PTY spawns at `cwd` (Sprint 0.7
   *  "Open terminal in lab" - lands the shell in an experiment island). */
  openTerminalAtCwd: (cwd: string, title?: string) => string;
  openFile: (
    fileId: string,
    filePath: string,
    name: string,
    opts?: { pin?: boolean; isExternal?: boolean },
  ) => void;
  /** Pin a preview tab (italic → normal) */
  pinTab: (id: string) => void;
  openTexworkspaceFile: (fileId: string, filePath: string, name: string) => void;
  /** Switch the texworkspace tab's active file without changing the tab title */
  setTexworkspaceActiveFile: (fileId: string) => void;
  switchToTexworkspace: (fileId: string, filePath: string, name: string) => void;
  openGitDiff: (filePath: string) => void;
  newBrowserTab: () => string;
  newTerminalTab: () => string;
  newAiTerminalTab: (opts: {
    chatTabId: string;
    toolCallId?: string;
    title?: string;
  }) => string;
  openSettingsEditorTab: (slot: SettingsPanelSlot) => string;
  /** Close AI terminal without confirmation or PTY destroy */
  closeAiTab: (id: string) => void;
  /** Remove duplicate AI tab without marking session dismissed */
  removeAiTabSilently: (id: string) => void;
  updateTerminalTabTitle: (id: string, title: string) => void;
  navigateBrowserTab: (id: string, url: string) => void;
  updateBrowserTabTitle: (id: string, title: string) => void;
  setBrowserTabLoading: (id: string, isLoading: boolean) => void;
  setTabHibernated: (id: string, hibernated: boolean) => void;
  closeTab: (id: string) => void;
  /** Close with unsaved/busy confirmation. Returns false if user cancelled. */
  requestCloseTab: (id: string) => boolean;
  closeAllTabs: () => void;
  /** Remove all tabs of a specific kind (used when deactivating transient modes) */
  closeTabsOfKind: (kind: RightTabKind, options?: { onClosed?: () => void }) => void;
  /** Check if any tabs of a given kind exist */
  hasTabsOfKind: (kind: RightTabKind) => boolean;
  /** Remove literature tabs opened for a deleted paper */
  closeLiteraturePaperTabs: (paperId: string) => void;
  setActiveTab: (id: string) => void;
  setTabViewMode: (id: string, mode: string) => void;
  updateTab: (id: string, partial: Partial<Pick<RightTab, "fileId" | "filePath" | "title" | "terminalSource" | "terminalCwd" | "linkedChatTabId" | "linkedToolCallId" | "settingsSlot" | "settingsSlotKey" | "literaturePaperId" | "literatureView" | "experimentId" | "experimentsView">>) => void;
  moveTab: (fromIndex: number, toIndex: number) => void;
}

export const useRightPanelStore = create<RightPanelState>()((set, get) => ({
  tabs: [],
  activeTabId: null,

  ensureTab: (kind: RightTabKind) => {
    const { tabs } = get();
    // Reuse an existing initial tab if present
    const existing = tabs.find((t) => t.kind === kind && t.isInitial);
    if (existing) {
      set({ activeTabId: existing.id });
      return existing.id;
    }
    // texworkspace is a singleton — reuse the existing tab
    if (kind === "texworkspace") {
      const texTab = tabs.find((t) => t.kind === "texworkspace");
      if (texTab) {
        set({ activeTabId: texTab.id });
        return texTab.id;
      }
    }
    const id = nextTabId();
    const tab: RightTab = { id, kind, title: modeRegistry.findByTabKind(kind)?.initialTitle ?? kind, isInitial: true };
    set((s) => ({ tabs: [tab, ...s.tabs], activeTabId: id }));
    return id;
  },

  openLiteraturePaper: (paperId, title, view = "reader") => {
    useLayoutStore.getState().activateMode("literature");
    const { tabs } = get();
    const existing = tabs.find((t) => t.kind === "literature" && t.literaturePaperId === paperId);
    if (existing) {
      set({ activeTabId: existing.id });
      return existing.id;
    }
    const id = nextTabId();
    const tab: RightTab = {
      id,
      kind: "literature",
      title: title.slice(0, 48),
      isInitial: false,
      literaturePaperId: paperId,
      literatureView: view,
    };
    set((s) => ({ tabs: [tab, ...s.tabs], activeTabId: id }));
    return id;
  },

  openExperimentTab: (experimentId, title) => {
    useLayoutStore.getState().activateMode("experiments");
    // Keep a browse home tab around so closing detail doesn't lose the grid.
    get().ensureTab("experiments");
    const { tabs } = get();
    const existing = tabs.find(
      (t) => t.kind === "experiments" && t.experimentId === experimentId,
    );
    if (existing) {
      set({ activeTabId: existing.id });
      return existing.id;
    }
    const id = nextTabId();
    const tab: RightTab = {
      id,
      kind: "experiments",
      title: title.slice(0, 48),
      isInitial: false,
      experimentId,
      experimentsView: "detail",
    };
    set((s) => ({ tabs: [tab, ...s.tabs], activeTabId: id }));
    return id;
  },

  closeExperimentTabs: (experimentId) => {
    const removeIds = new Set(
      get()
        .tabs.filter((t) => t.kind === "experiments" && t.experimentId === experimentId)
        .map((t) => t.id),
    );
    if (removeIds.size === 0) return;
    set((s) => {
      const next = s.tabs.filter((t) => !removeIds.has(t.id));
      const nextActive =
        s.activeTabId && removeIds.has(s.activeTabId)
          ? (next.find((t) => t.kind === "experiments" && !t.experimentId)?.id ??
            next[0]?.id ??
            null)
          : s.activeTabId;
      return { tabs: next, activeTabId: nextActive };
    });
    if (!get().hasTabsOfKind("experiments")) {
      get().ensureTab("experiments");
    }
  },

  activateExperimentsHomeTab: () => {
    useLayoutStore.getState().activateMode("experiments");
    const homeId = get().ensureTab("experiments");
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === homeId
          ? {
              ...buildInitialTabShell(t, "Experiments"),
              experimentsView: "list" as const,
              experimentId: undefined,
            }
          : t,
      ),
      activeTabId: homeId,
    }));
    return homeId;
  },

  openTerminalAtCwd: (cwd, title) => {
    useLayoutStore.getState().activateMode("terminal");
    const { tabs } = get();
    // Reuse an existing terminal tab spawned at the same cwd.
    const existing = tabs.find((t) => t.kind === "terminal" && t.terminalCwd === cwd);
    if (existing) {
      set({ activeTabId: existing.id });
      return existing.id;
    }
    const id = nextTabId();
    const tab: RightTab = {
      id,
      kind: "terminal",
      title: (title ?? "Terminal").slice(0, 48),
      isInitial: false,
      terminalCwd: cwd,
      terminalSource: "user",
    };
    set((s) => ({ tabs: [tab, ...s.tabs], activeTabId: id }));
    return id;
  },

  openTexworkspaceFile: (fileId: string, filePath: string, name: string) => {
    const { tabs, activeTabId } = get();
    const texworkspaceTab = tabs.find((t) => t.kind === "texworkspace" && t.id === activeTabId);
    if (!texworkspaceTab) return;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === texworkspaceTab.id ? { ...t, title: name, fileId, filePath, isInitial: false } : t,
      ),
    }));
    useDocumentStore.getState().setActiveFile(fileId);
  },

  setTexworkspaceActiveFile: (fileId: string) => {
    const { tabs, activeTabId } = get();
    const texworkspaceTab = tabs.find((t) => t.kind === "texworkspace" && t.id === activeTabId);
    if (!texworkspaceTab) return;
    const meta = useDocumentStore.getState().fileMetadata.get(fileId);
    const filePath = meta?.relativePath ?? fileId;
    const title = meta?.name ?? texworkspaceTab.title;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === texworkspaceTab.id
          ? { ...t, fileId, filePath, title, isInitial: false }
          : t,
      ),
    }));
    useDocumentStore.getState().setActiveFile(fileId);
  },

  switchToTexworkspace: (fileId: string, filePath: string, name: string) => {
    useLayoutStore.getState().activateMode("texworkspace");
    const { tabs } = get();
    const existing = tabs.find((t) => t.kind === "texworkspace");
    if (existing) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === existing.id ? { ...t, title: name, fileId, filePath, isInitial: false } : t,
        ),
        activeTabId: existing.id,
      }));
    } else {
      const id = nextTabId();
      const tab: RightTab = { id, kind: "texworkspace", title: name, fileId, filePath, isInitial: false };
      set((s) => ({ tabs: [tab, ...s.tabs], activeTabId: id }));
    }
    useDocumentStore.getState().setActiveFile(fileId);
  },

  openFile: (fileId, filePath, name, opts) => {
    const pin = opts?.pin ?? false;
    const isExternal = opts?.isExternal ?? false;

    useLayoutStore.getState().activateMode("files");

    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    const defaultViewMode = ext === ".md" || ext === ".mdx" ? "preview" : "source";
    const { tabs, activeTabId } = get();

    const existing = tabs.find((t) => t.kind === "file" && t.fileId === fileId);
    if (existing) {
      if (pin && existing.isPreview) {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === existing.id ? { ...t, isPreview: false } : t,
          ),
          activeTabId: existing.id,
        }));
      } else {
        set({ activeTabId: existing.id });
      }
      return;
    }

    const makeFileTab = (id: string): RightTab => ({
      id,
      kind: "file",
      title: name,
      fileId,
      filePath,
      isInitial: false,
      isPreview: !pin,
      isExternal,
      viewMode: defaultViewMode,
    });

    const active = tabs.find((t) => t.id === activeTabId);

    // Replace empty home tab
    if (active?.kind === "file" && active.isInitial) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === active.id ? makeFileTab(active.id) : t,
        ),
        activeTabId: active.id,
      }));
      return;
    }

    // Single-click preview: reuse the one preview tab (VS Code behavior)
    if (!pin) {
      const previewTab = tabs.find((t) => t.kind === "file" && t.isPreview);
      if (previewTab) {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === previewTab.id ? makeFileTab(previewTab.id) : t,
          ),
          activeTabId: previewTab.id,
        }));
        return;
      }
    }

    const id = nextTabId();
    set((s) => ({
      tabs: [makeFileTab(id), ...s.tabs],
      activeTabId: id,
    }));
  },

  pinTab: (id: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id && t.kind === "file" && t.isPreview
          ? { ...t, isPreview: false }
          : t,
      ),
    }));
  },

  openGitDiff: (filePath: string) => {
    // Ensure Git mode is active and focused
    useLayoutStore.getState().activateMode("git");
    const name = filePath.split("/").pop() || filePath;
    const id = nextTabId();
    const tab: RightTab = { id, kind: "git-diff", title: name, filePath, isInitial: false };
    set((s) => ({ tabs: [tab, ...s.tabs], activeTabId: id }));
  },

  navigateBrowserTab: (id: string, url: string) => {
    let hostname = "";
    try { hostname = new URL(url).hostname; } catch { /* ignore */ }
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, url, title: hostname || "New Tab", isInitial: false } : t,
      ),
    }));
  },

  updateBrowserTabTitle: (id: string, title: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, title } : t,
      ),
    }));
  },

  setBrowserTabLoading: (id: string, isLoading: boolean) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, isLoading } : t,
      ),
    }));
  },

  setTabHibernated: (id: string, hibernated: boolean) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, hibernated } : t,
      ),
    }));
  },

  newBrowserTab: () => {
    const { tabs, activeTabId } = get();
    const active = tabs.find((t) => t.id === activeTabId);
    if (active?.kind === "browser" && active.isInitial) return active.id;
    const existing = tabs.find((t) => t.kind === "browser" && t.isInitial);
    if (existing) { set({ activeTabId: existing.id }); return existing.id; }
    const id = nextTabId();
    const tab: RightTab = { id, kind: "browser", title: modeRegistry.findByTabKind("browser")?.initialTitle ?? "Browser", isInitial: true };
    set((s) => ({ tabs: [tab, ...s.tabs], activeTabId: id }));
    return id;
  },

  newTerminalTab: () => {
    const id = nextTabId();
    const shell = useTerminalStore.getState().envInfo?.shell;
    const tab: RightTab = {
      id,
      kind: "terminal",
      title: shell
        ? shellDisplayName(shell)
        : modeRegistry.findByTabKind("terminal")?.initialTitle ?? "Shell",
      isInitial: false,
      terminalSource: "user",
    };
    set((s) => ({ tabs: [tab, ...s.tabs], activeTabId: id }));
    return id;
  },

  newAiTerminalTab: (opts) => {
    const id = nextTabId();
    const tab: RightTab = {
      id,
      kind: "terminal",
      title: opts.title ?? "AI Terminal",
      isInitial: false,
      terminalSource: "ai",
      linkedChatTabId: opts.chatTabId,
      linkedToolCallId: opts.toolCallId,
    };
    set((s) => ({ tabs: [tab, ...s.tabs], activeTabId: id }));
    return id;
  },

  openSettingsEditorTab: (slot) => {
    const key = settingsPanelSlotKey(slot);
    const title = settingsPanelSlotTitle(slot) ?? "Settings";
    const { tabs } = get();
    const existing = tabs.find(
      (t) => t.kind === "settings-editor" && t.settingsSlotKey === key,
    );
    if (existing) {
      set({
        activeTabId: existing.id,
        tabs: tabs.map((t) =>
          t.kind === "settings-editor" && t.settingsSlotKey === key
            ? { ...t, settingsSlot: slot, title }
            : t,
        ),
      });
      return existing.id;
    }
    const id = nextTabId();
    const tab: RightTab = {
      id,
      kind: "settings-editor",
      title,
      isInitial: false,
      settingsSlot: slot,
      settingsSlotKey: key,
    };
    set((s) => ({ tabs: [tab, ...s.tabs], activeTabId: id }));
    return id;
  },

  closeAiTab: (id) => {
    performCloseTab(id, { skipTerminalDestroy: true });
  },

  removeAiTabSilently: (id) => {
    performCloseTab(id, { skipTerminalDestroy: true, skipAiDismiss: true });
  },

  updateTerminalTabTitle: (id: string, title: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, title } : t,
      ),
    }));
  },

  closeTab: (id: string) => {
    get().requestCloseTab(id);
  },

  requestCloseTab: (id: string) => {
    const closingTab = get().tabs.find((t) => t.id === id);
    if (!closingTab) return false;

    const confirmation = getTabCloseConfirmation(closingTab);
    if (confirmation) {
      useTabCloseConfirmStore.getState().open({
        ...confirmation,
        onConfirm: () => {
          if (
            closingTab.terminalSource === "ai"
            && useSettingsStore.getState().settings.aiTerminalCloseTabKillsProcess === true
            && closingTab.linkedChatTabId
          ) {
            const sessionId = useChatStore
              .getState()
              .tabs.find((t) => t.id === closingTab.linkedChatTabId)?.sessionId;
            if (sessionId) {
              void window.electronAPI.chatCancel(sessionId);
            }
          }
          performCloseTab(id);
        },
      });
      return false;
    }

    performCloseTab(id);
    return true;
  },

  setActiveTab: (id: string) => {
    const tab = get().tabs.find((t) => t.id === id);
    set({ activeTabId: id });
    const fileId = (tab?.kind === "file" || tab?.kind === "texworkspace") && tab.fileId ? tab.fileId : "";
    useDocumentStore.getState().setActiveFile(fileId);
    if (tab?.terminalSource === "ai" && tab.linkedChatTabId) {
      useTerminalAiStore.getState().touchSessionViewed(tab.linkedChatTabId);
    }
  },

  setTabViewMode: (id: string, mode: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, viewMode: mode } : t)),
    }));
  },

  updateTab: (id: string, partial) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...partial } : t)),
    }));
  },

  closeAllTabs: () => {
    const tabs = get().tabs;
    const confirmation = getBatchTabCloseConfirmation(tabs);

    const doCloseAll = () => {
      const terminalTabIds = tabs
        .filter((t) => t.kind === "terminal" && t.terminalSource !== "ai")
        .map((t) => t.id);
      if (terminalTabIds.length > 0) {
        useTerminalStore.getState().destroyAllTerminalTabs(terminalTabIds);
      }
      useTerminalStore.getState().resetProjectState();
      useRightPanelStore.setState({ tabs: [], activeTabId: null });
      useDocumentStore.getState().setActiveFile("");
      useLayoutStore.setState({ activeModes: [], focusedMode: "dashboard" });
    };

    if (confirmation) {
      useTabCloseConfirmStore.getState().open({
        ...confirmation,
        onConfirm: doCloseAll,
      });
      return;
    }

    doCloseAll();
  },

  closeLiteraturePaperTabs: (paperId) => {
    const removeIds = new Set(
      get().tabs.filter((t) => t.kind === "literature" && t.literaturePaperId === paperId).map((t) => t.id),
    );
    if (removeIds.size === 0) return;
    set((s) => {
      const next = s.tabs.filter((t) => !removeIds.has(t.id));
      const nextActive =
        s.activeTabId && removeIds.has(s.activeTabId) ? (next[0]?.id ?? null) : s.activeTabId;
      return { tabs: next, activeTabId: nextActive };
    });
  },

  closeTabsOfKind: (kind, options) => {
    const toClose = get().tabs.filter((t) => t.kind === kind);
    if (toClose.length === 0) {
      options?.onClosed?.();
      return;
    }

    const confirmation = getBatchTabCloseConfirmation(toClose);

    const doClose = () => {
      const terminalTabIds = toClose
        .filter((t) => t.kind === "terminal" && t.terminalSource !== "ai")
        .map((t) => t.id);

      if (kind === "terminal" && terminalTabIds.length > 0) {
        useTerminalStore.getState().destroyAllTerminalTabs(terminalTabIds);
      }

      useRightPanelStore.setState((s) => {
        const next = s.tabs.filter((t) => t.kind !== kind);
        const nextActive = next.length > 0 ? next[0].id : null;
        if (kind === "file" || kind === "texworkspace") {
          useDocumentStore.getState().setActiveFile("");
        }
        return { tabs: next, activeTabId: nextActive };
      });
      options?.onClosed?.();
    };

    if (confirmation) {
      useTabCloseConfirmStore.getState().open({
        ...confirmation,
        onConfirm: doClose,
      });
      return;
    }

    doClose();
  },

  hasTabsOfKind: (kind: RightTabKind) => {
    return get().tabs.some((t) => t.kind === kind);
  },

  moveTab: (fromIndex: number, toIndex: number) => {
    set((s) => {
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, moved);
      return { tabs };
    });
  },
}));

function performCloseTab(
  id: string,
  options?: { skipTerminalDestroy?: boolean; skipAiDismiss?: boolean },
): void {
  const state = useRightPanelStore.getState();
  const closingTab = state.tabs.find((t) => t.id === id);
  if (!closingTab) return;

  const literatureCloseAction = getLiteratureTabCloseAction(closingTab, state.tabs);
  if (literatureCloseAction === "deactivate-mode") {
    deactivateModeByTabKind(closingTab.kind);
    return;
  }
  if (literatureCloseAction === "remove-and-ensure-home") {
    useRightPanelStore.setState((s) => ({
      tabs: s.tabs.filter((t) => t.id !== id),
      activeTabId: null,
    }));
    const homeId = useRightPanelStore.getState().ensureTab("literature");
    useRightPanelStore.setState({ activeTabId: homeId });
    return;
  }

  const experimentsCloseAction = getExperimentsTabCloseAction(closingTab, state.tabs);
  if (experimentsCloseAction === "deactivate-mode") {
    deactivateModeByTabKind(closingTab.kind);
    return;
  }
  if (experimentsCloseAction === "remove-and-ensure-home") {
    useRightPanelStore.setState((s) => ({
      tabs: s.tabs.filter((t) => t.id !== id),
      activeTabId: null,
    }));
    const homeId = useRightPanelStore.getState().ensureTab("experiments");
    useRightPanelStore.setState({ activeTabId: homeId });
    return;
  }

  const sameKind = state.tabs.filter((t) => t.kind === closingTab.kind);
  const isLastOfKind = sameKind.length === 1;
  const def = modeRegistry.findByTabKind(closingTab.kind);
  const isPersistent = def?.persistence === "persistent";

  if (isLastOfKind && isPersistent) {
    if (closingTab.isInitial) {
      deactivateModeByTabKind(closingTab.kind);
      return;
    }
    useRightPanelStore.setState((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
          ? buildInitialTabShell(
              t,
              modeRegistry.findByTabKind(t.kind)?.initialTitle ?? t.kind,
            )
          : t,
      ),
    }));
    if (closingTab.kind === "file") {
      useDocumentStore.getState().setActiveFile("");
    }
    return;
  }

  let closedAiTabId: string | undefined;

  useRightPanelStore.setState((s) => {
    const closing = s.tabs.find((t) => t.id === id);
    const next = s.tabs.filter((t) => t.id !== id);
    const closingMode = modeRegistry.findByTabKind(closing?.kind ?? "file")?.id ?? "files";

    let nextActive = s.activeTabId;
    if (s.activeTabId === id) {
      const sameModeTab = next.find((t) => {
        const modeDef = modeRegistry.findByTabKind(t.kind);
        return modeDef?.id === closingMode;
      });
      nextActive = sameModeTab?.id ?? (next.length > 0 ? next[0].id : null);
    }
    const nextActiveTab = next.find((t) => t.id === nextActive);
    const nextFileId =
      (nextActiveTab?.kind === "file" || nextActiveTab?.kind === "texworkspace") && nextActiveTab.fileId
        ? nextActiveTab.fileId
        : "";
    useDocumentStore.getState().setActiveFile(nextFileId);

    if (closing?.kind === "terminal" && closing.terminalSource !== "ai" && !options?.skipTerminalDestroy) {
      useTerminalStore.getState().destroyTab(closing.id);
    }

    if (closing?.kind === "terminal" && closing.terminalSource === "ai") {
      closedAiTabId = closing.id;
    }

    const hasRemainingOfMode = next.some((t) => {
      const modeDef = modeRegistry.findByTabKind(t.kind);
      return modeDef?.id === closingMode;
    });
    if (!hasRemainingOfMode && closing) {
      useLayoutStore.setState((st) => {
        const remainingModes = st.activeModes.filter((m) => m !== closingMode);
        const newFocused = remainingModes.length > 0
          ? remainingModes[remainingModes.length - 1]
          : "dashboard";
        return { activeModes: remainingModes, focusedMode: newFocused };
      });
      if (useLayoutStore.getState().focusedMode === "dashboard") {
        nextActive = null;
      } else {
        const newModeTab = next.find((t) => {
          const modeDef = modeRegistry.findByTabKind(t.kind);
          return modeDef?.id === useLayoutStore.getState().focusedMode;
        });
        nextActive = newModeTab?.id ?? null;
      }
    }

    return { tabs: next, activeTabId: nextActive };
  });

  if (closedAiTabId && !options?.skipAiDismiss) {
    useTerminalAiStore.getState().onAiTabClosedByUser(closedAiTabId);
  }
}

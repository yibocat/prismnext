import { create } from "zustand";
import { useDocumentStore } from "./document-store";
import { useLayoutStore } from "./layout-store";
import { useTerminalStore } from "./terminal-store";
import { remoteTerminalTabTitle, shellDisplayName } from "@/lib/terminal/shell-label";
import { isRemoteProjectRoot } from "@shared/remote";
import { i18n } from "@/lib/i18n";
import { useTerminalAiStore } from "./terminal-ai-store";
import {
  isFileBackedTab,
  isJobMonitorTab,
  modeRegistry,
  type RightTabKind,
  type RightTab,
  type RightTabUpdate,
} from "@/lib/workspace/mode-registry";
import { useExecutionStore } from "./execution-store";
import { isChatScopedExecution } from "../../shared/execution";
import { notifyModeLifecycleTransitions } from "@/lib/workspace/modes-from-tabs";
import { isResearchPlanFilePath } from "@/lib/chat/plan-artifact-ui";
import { getTabCloseConfirmation, getBatchTabCloseConfirmation } from "@/lib/workspace/tab-close-confirmation";
import { createHomeTab } from "@/lib/workspace/tab-lifecycle";
import { useTabCloseConfirmStore } from "@/stores/tab-close-confirm-store";
import { readTerminalExecutionSettings } from "@/lib/terminal/ai-prefs";
import { useChatStore } from "@/stores/chat-store";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import { settingsPanelSlotKey } from "@/lib/settings/settings-panel-slot-key";
import { settingsPanelSlotTitle } from "@/lib/settings/settings-panel-slots";
import { selectExperimentProjectRoot } from "@/lib/experiments/project-root";
import { useSettingsStore } from "@/stores/settings-store";
import { executionDesktop } from "@/lib/desktop-api/execution";
import { agentDesktop } from "@/lib/desktop-api/agent";

// ─── Re-exports ───

export type { RightTabKind, RightTab } from "@/lib/workspace/mode-registry";

// ─── Helpers ───

let _tabSeq = 0;
function nextTabId(): string {
  return `right-tab-${++_tabSeq}`;
}

function trackOpenedExperiment(experimentId: string, title: string): void {
  const projectRoot = selectExperimentProjectRoot(useDocumentStore.getState());
  if (!projectRoot) return;
  void useSettingsStore.getState().trackRecentOpenedExperiment(projectRoot, experimentId, title);
}

// ─── Store ───

interface RightPanelState {
  tabs: RightTab[];
  activeTabId: string | null;

  ensureTab: (kind: RightTabKind) => string;
  openLiteraturePaper: (paperId: string, title: string, view?: "grid" | "reader" | "notes") => string;
  /** Always spawn a Library home tab (「+」→ Literature). */
  newLiteratureHomeTab: () => string;
  /** Open / focus a detail tab for one experiment (Files-like home replace). */
  openExperimentTab: (experimentId: string, title: string) => string;
  /** Open/focus an Interaction panel tab for a persisted object id. */
  openInteractionTab: (interactionId: string, title: string) => string;
  updateExperimentTabTitle: (experimentId: string, title: string) => void;
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
  /** Open a research plan of record in the dedicated Plan tab (not Files). */
  openResearchPlan: (
    fileId: string,
    filePath: string,
    name: string,
    opts?: { pin?: boolean },
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
  /** Attach a read-only Job Monitor to one Execution. Reuses an existing tab. */
  openJobMonitor: (executionId: string) => string;
  openSettingsEditorTab: (slot: SettingsPanelSlot) => string;
  /** Create/update a settings editor tab without forcing it active. */
  ensureSettingsEditorTab: (slot: SettingsPanelSlot) => string;
  /** Close AI terminal without confirmation or PTY destroy */
  closeAiTab: (id: string) => void;
  /** Remove duplicate AI tab without marking session dismissed */
  removeAiTabSilently: (id: string) => void;
  updateTerminalTabTitle: (id: string, title: string) => void;
  /** User-intent navigation — updates URL (and may reset title to hostname). */
  navigateBrowserTab: (id: string, url: string) => void;
  /**
   * Sync address-bar URL from webview events only.
   * Must NOT drive `<webview src>` reloads (that causes redirect loops).
   */
  syncBrowserTabUrl: (id: string, url: string) => void;
  updateBrowserTabTitle: (id: string, title: string) => void;
  setBrowserTabLoading: (id: string, isLoading: boolean) => void;
  /** Reload the guest even when the URL has not changed. */
  reloadBrowserTab: (id: string) => void;
  setTabHibernated: (id: string, hibernated: boolean) => void;
  closeTab: (id: string) => void;
  /**
   * Close with unsaved/busy confirmation.
   * Returns false when a confirmation dialog was shown (close deferred) or tab missing.
   * `onAfterClose` runs after the tab is actually removed (immediate or post-confirm).
   */
  requestCloseTab: (id: string, options?: { onAfterClose?: () => void }) => boolean;
  closeAllTabs: (options?: { force?: boolean }) => void;
  /** Remove all tabs of a specific kind (used when deactivating transient modes) */
  closeTabsOfKind: (kind: RightTabKind, options?: { onClosed?: () => void }) => void;
  /** Check if any tabs of a given kind exist */
  hasTabsOfKind: (kind: RightTabKind) => boolean;
  /** Remove literature tabs opened for a deleted paper */
  closeLiteraturePaperTabs: (paperId: string) => void;
  setActiveTab: (id: string) => void;
  setTabViewMode: (id: string, mode: string) => void;
  updateTab: (id: string, partial: RightTabUpdate) => void;
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
    const tab = createHomeTab(kind, id);
    set((s) => ({ tabs: [tab, ...s.tabs], activeTabId: id }));
    return id;
  },

  openLiteraturePaper: (paperId, title, view = "reader") => {
    const { tabs, activeTabId } = get();
    const existing = tabs.find((t) => t.kind === "literature" && t.literaturePaperId === paperId);
    if (existing) {
      set({ activeTabId: existing.id });
      return existing.id;
    }

    const makePaperTab = (id: string): RightTab => ({
      id,
      kind: "literature",
      title: title.slice(0, 48),
      isInitial: false,
      literaturePaperId: paperId,
      literatureView: view,
    });

    const active = tabs.find((t) => t.id === activeTabId);
    // Files / Experiments-like: replace Library home in place.
    if (active?.kind === "literature" && !active.literaturePaperId) {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === active.id ? makePaperTab(active.id) : t)),
        activeTabId: active.id,
      }));
      return active.id;
    }

    const id = nextTabId();
    set((s) => ({ tabs: [makePaperTab(id), ...s.tabs], activeTabId: id }));
    return id;
  },

  newLiteratureHomeTab: () => {
    const id = nextTabId();
    const tab: RightTab = {
      id,
      kind: "literature",
      title: modeRegistry.findByTabKind("literature")?.initialTitle ?? "Library",
      isInitial: true,
    };
    set((s) => ({ tabs: [tab, ...s.tabs], activeTabId: id }));
    return id;
  },

  openExperimentTab: (experimentId, title) => {
    // Files-like: show experiment list beside detail (deferred until RightArea has width).
    useLayoutStore.getState().revealRightSidebar();

    const { tabs, activeTabId } = get();
    const existing = tabs.find(
      (t) => t.kind === "experiments" && t.experimentId === experimentId,
    );
    if (existing) {
      set({ activeTabId: existing.id });
      trackOpenedExperiment(experimentId, title);
      return existing.id;
    }

    const makeDetailTab = (id: string): RightTab => ({
      id,
      kind: "experiments",
      title: title.slice(0, 48),
      isInitial: false,
      experimentId,
      experimentsView: "detail",
    });

    const active = tabs.find((t) => t.id === activeTabId);
    // Files-like: replace empty Experiments home in place (no parallel home+detail).
    if (active?.kind === "experiments" && !active.experimentId) {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === active.id ? makeDetailTab(active.id) : t)),
        activeTabId: active.id,
      }));
      trackOpenedExperiment(experimentId, title);
      return active.id;
    }

    const id = nextTabId();
    set((s) => ({ tabs: [makeDetailTab(id), ...s.tabs], activeTabId: id }));
    trackOpenedExperiment(experimentId, title);
    return id;
  },

  openInteractionTab: (interactionId, title) => {
    const { tabs } = get();
    const existing = tabs.find(
      (t) => t.kind === "interaction" && t.interactionId === interactionId,
    );
    if (existing) {
      set({ activeTabId: existing.id });
      return existing.id;
    }
    const id = nextTabId();
    const tab: RightTab = {
      id,
      kind: "interaction",
      title: title.slice(0, 48),
      isInitial: false,
      interactionId,
    };
    set((s) => ({ tabs: [tab, ...s.tabs], activeTabId: id }));
    return id;
  },

  updateExperimentTabTitle: (experimentId, title) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.kind === "experiments" && t.experimentId === experimentId
          ? { ...t, title: title.slice(0, 48) }
          : t,
      ),
    }));
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
          ? (next.find((t) => t.kind === "experiments")?.id ?? next[0]?.id ?? null)
          : s.activeTabId;
      return { tabs: next, activeTabId: nextActive };
    });
  },

  activateExperimentsHomeTab: () => {
    const homeId = get().ensureTab("experiments");
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === homeId
          ? {
              ...createHomeTab("experiments", t.id, "Experiments"),
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
    const { tabs } = get();
    // Reuse an existing terminal tab spawned at the same cwd.
    const existing = tabs.find(
      (t) => t.kind === "terminal" && t.terminalCwd === cwd && !isJobMonitorTab(t),
    );
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
        t.id === texworkspaceTab.id && t.kind === "texworkspace"
          ? { ...t, title: name, fileId, filePath, isInitial: false }
          : t,
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
        t.id === texworkspaceTab.id && t.kind === "texworkspace"
          ? { ...t, fileId, filePath, title, isInitial: false }
          : t,
      ),
    }));
    useDocumentStore.getState().setActiveFile(fileId);
  },

  switchToTexworkspace: (fileId: string, filePath: string, name: string) => {
    const { tabs } = get();
    const existing = tabs.find((t) => t.kind === "texworkspace");
    if (existing) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === existing.id && t.kind === "texworkspace"
            ? { ...t, title: name, fileId, filePath, isInitial: false }
            : t,
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
    if (isResearchPlanFilePath(filePath) || isResearchPlanFilePath(fileId)) {
      get().openResearchPlan(fileId, filePath, name, { pin: opts?.pin });
      return;
    }

    const pin = opts?.pin ?? false;
    const isExternal = opts?.isExternal ?? false;

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

  openResearchPlan: (fileId, filePath, name, opts) => {
    const pin = opts?.pin ?? true;

    const { tabs } = get();

    // Drop a stale Files tab on the same path so Plan owns the surface.
    const strayFileIds = new Set(
      tabs
        .filter((t) => t.kind === "file" && (t.fileId === fileId || t.filePath === filePath))
        .map((t) => t.id),
    );

    const existing = tabs.find(
      (t) => t.kind === "research-plan" && (t.fileId === fileId || t.filePath === filePath),
    );

    const makePlanTab = (id: string): RightTab => ({
      id,
      kind: "research-plan",
      title: name,
      fileId,
      filePath,
      isInitial: false,
      isPreview: !pin,
      viewMode: "preview",
    });

    if (existing) {
      set((s) => ({
        tabs: s.tabs
          .filter((t) => !strayFileIds.has(t.id))
          .map((t) =>
            t.id === existing.id
              ? {
                  ...makePlanTab(existing.id),
                  isPreview: pin ? false : t.isPreview,
                }
              : t,
          ),
        activeTabId: existing.id,
      }));
      useDocumentStore.getState().setActiveFile(fileId);
      return;
    }

    const id = nextTabId();
    set((s) => ({
      tabs: [makePlanTab(id), ...s.tabs.filter((t) => !strayFileIds.has(t.id))],
      activeTabId: id,
    }));
    useDocumentStore.getState().setActiveFile(fileId);
  },

  pinTab: (id: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
        && (t.kind === "file" || t.kind === "research-plan")
        && t.isPreview
          ? { ...t, isPreview: false }
          : t,
      ),
    }));
  },

  openGitDiff: (filePath: string) => {
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
        t.id === id && t.kind === "browser"
          ? { ...t, url, title: hostname || "New Tab", isInitial: false }
          : t,
      ),
    }));
  },

  syncBrowserTabUrl: (id: string, url: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== id || t.kind !== "browser" || t.url === url) return t;
        return { ...t, url, isInitial: false };
      }),
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
        t.id === id && t.kind === "browser" ? { ...t, isLoading } : t,
      ),
    }));
  },

  reloadBrowserTab: (id: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id && t.kind === "browser"
          ? {
              ...t,
              isLoading: true,
              hibernated: false,
              reloadToken: (t.reloadToken ?? 0) + 1,
            }
          : t,
      ),
    }));
  },

  setTabHibernated: (id: string, hibernated: boolean) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id && t.kind === "browser" ? { ...t, hibernated } : t,
      ),
    }));
  },

  newBrowserTab: () => {
    // Always spawn a blank Browser tab (Chrome-style +). Do not reuse an
    // existing isInitial home — that blocked multi-open while sitting on home.
    const id = nextTabId();
    const tab: RightTab = {
      id,
      kind: "browser",
      title: modeRegistry.findByTabKind("browser")?.initialTitle ?? "Browser",
      isInitial: true,
    };
    set((s) => ({ tabs: [tab, ...s.tabs], activeTabId: id }));
    return id;
  },

  newTerminalTab: () => {
    const id = nextTabId();
    const projectRoot = useDocumentStore.getState().projectRoot;
    const remote = Boolean(projectRoot && isRemoteProjectRoot(projectRoot));
    const shell = useTerminalStore.getState().envInfo?.shell;
    const tab: RightTab = {
      id,
      kind: "terminal",
      title: remote
        ? i18n.t("modes.terminal.remoteTitle", { shell: remoteTerminalTabTitle("/bin/bash") })
        : shell
          ? shellDisplayName(shell)
          : modeRegistry.findByTabKind("terminal")?.initialTitle ?? "Shell",
      isInitial: false,
      terminalSource: "user",
    };
    set((s) => ({ tabs: [tab, ...s.tabs], activeTabId: id }));
    return id;
  },

  newAiTerminalTab: (opts) => {
    const executionId = opts.toolCallId
      ? useExecutionStore.getState().findByToolCallId(opts.toolCallId)
      : undefined;
    if (executionId) return get().openJobMonitor(executionId);
    return "";
  },

  openJobMonitor: (executionId) => {
    const idValue = (executionId || "").trim();
    if (!idValue) return "";
    const summary = useExecutionStore.getState().byId[idValue]?.summary;
    const chatTabId = summary?.chatTabId;
    const chatScoped = Boolean(summary && isChatScopedExecution(summary));
    const existing = get().tabs.find((t) => {
      if (!isJobMonitorTab(t)) return false;
      if (t.linkedExecutionId === idValue) return true;
      return Boolean(chatScoped && chatTabId && t.linkedChatTabId === chatTabId);
    });
    if (existing?.kind === "terminal") {
      const dismissChat = existing.linkedChatTabId ?? chatTabId;
      if (dismissChat) useExecutionStore.getState().clearMonitorDismissed(dismissChat);
      useLayoutStore.getState().requestRightAreaExpand();
      set((s) => ({
        activeTabId: existing.id,
        tabs: s.tabs.map((t) =>
          t.id === existing.id && t.kind === "terminal"
            ? {
                ...t,
                linkedExecutionId: idValue,
                linkedToolCallId: summary?.toolCallId ?? t.linkedToolCallId,
                linkedChatTabId: chatTabId ?? t.linkedChatTabId,
                terminalCwd: summary?.cwd ?? t.terminalCwd,
                title: chatScoped ? (t.title || "AI") : (summary?.command || t.title).slice(0, 48),
              }
            : t,
        ),
      }));
      return existing.id;
    }
    if (chatTabId) useExecutionStore.getState().clearMonitorDismissed(chatTabId);
    const id = nextTabId();
    const tab: RightTab = {
      id,
      kind: "terminal",
      title: chatScoped ? "AI" : (summary?.command || "Job").slice(0, 48),
      isInitial: false,
      terminalSource: "job-monitor",
      linkedExecutionId: idValue,
      terminalCwd: summary?.cwd,
      linkedChatTabId: chatTabId,
      linkedToolCallId: summary?.toolCallId,
    };
    useLayoutStore.getState().requestRightAreaExpand();
    set((s) => ({ tabs: [tab, ...s.tabs], activeTabId: id }));
    return id;
  },

  ensureSettingsEditorTab: (slot) => {
    const key = settingsPanelSlotKey(slot);
    const title = settingsPanelSlotTitle(slot) ?? "Settings";
    const { tabs } = get();
    const existing = tabs.find(
      (t) => t.kind === "settings-editor" && t.settingsSlotKey === key,
    );
    if (existing) {
      set({
        tabs: tabs.map((t) =>
          t.id === existing.id && t.kind === "settings-editor"
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
    set((s) => ({ tabs: [tab, ...s.tabs] }));
    return id;
  },

  openSettingsEditorTab: (slot) => {
    const id = get().ensureSettingsEditorTab(slot);
    set({ activeTabId: id });
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

  requestCloseTab: (id, options) => {
    const closingTab = get().tabs.find((t) => t.id === id);
    if (!closingTab) return false;

    const finish = () => {
      performCloseTab(id);
      options?.onAfterClose?.();
    };

    const confirmation = getTabCloseConfirmation(closingTab);
    if (confirmation) {
      useTabCloseConfirmStore.getState().open({
        ...confirmation,
        onConfirm: () => {
          if (
            isJobMonitorTab(closingTab)
            && readTerminalExecutionSettings().jobMonitorCloseCancels
          ) {
            if (closingTab.linkedExecutionId) {
              void executionDesktop.executionCancel(closingTab.linkedExecutionId);
            } else if (closingTab.linkedChatTabId) {
              void agentDesktop.agentCancel({
                conversationId: closingTab.linkedChatTabId,
              });
            }
          }
          finish();
        },
      });
      return false;
    }

    finish();
    return true;
  },

  setActiveTab: (id: string) => {
    const tab = get().tabs.find((t) => t.id === id);
    set({ activeTabId: id });
    const fileId =
      tab && isFileBackedTab(tab) && tab.fileId ? tab.fileId : "";
    useDocumentStore.getState().setActiveFile(fileId);
    if (tab && isJobMonitorTab(tab) && tab.linkedChatTabId) {
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
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...partial } as RightTab : t)),
    }));
  },

  closeAllTabs: (options) => {
    const tabs = get().tabs;
    const confirmation = options?.force ? null : getBatchTabCloseConfirmation(tabs);

    const doCloseAll = () => {
      const terminalTabIds = tabs
        .filter((t) => t.kind === "terminal" && !isJobMonitorTab(t))
        .map((t) => t.id);
      if (terminalTabIds.length > 0) {
        useTerminalStore.getState().destroyAllTerminalTabs(terminalTabIds);
      }
      useTerminalStore.getState().resetProjectState();
      useRightPanelStore.setState({ tabs: [], activeTabId: null });
      useDocumentStore.getState().setActiveFile("");
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
        .filter((t) => t.kind === "terminal" && !isJobMonitorTab(t))
        .map((t) => t.id);

      if (kind === "terminal" && terminalTabIds.length > 0) {
        useTerminalStore.getState().destroyAllTerminalTabs(terminalTabIds);
      }

      useRightPanelStore.setState((s) => {
        const next = s.tabs.filter((t) => t.kind !== kind);
        const nextActive = next.length > 0 ? next[0].id : null;
        if (kind === "file" || kind === "texworkspace" || kind === "research-plan") {
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
      nextActiveTab && isFileBackedTab(nextActiveTab) && nextActiveTab.fileId
        ? nextActiveTab.fileId
        : "";
    useDocumentStore.getState().setActiveFile(nextFileId);

    if (closing?.kind === "terminal" && !isJobMonitorTab(closing) && !options?.skipTerminalDestroy) {
      useTerminalStore.getState().destroyTab(closing.id);
    }

    if (closing && isJobMonitorTab(closing)) {
      closedAiTabId = closing.id;
      if (closing.linkedChatTabId && !options?.skipAiDismiss) {
        useExecutionStore.getState().markMonitorDismissed(closing.linkedChatTabId);
      }
    }

    return { tabs: next, activeTabId: nextActive };
  });

  if (closedAiTabId && !options?.skipAiDismiss) {
    useTerminalAiStore.getState().onAiTabClosedByUser(closedAiTabId);
  }
}

/** Fire mode onActivate / onDeactivate when tab counts cross 0↔1. */
useRightPanelStore.subscribe((state, prev) => {
  if (state.tabs === prev.tabs) return;
  notifyModeLifecycleTransitions(prev.tabs, state.tabs);
});

import { create } from "zustand";
import { useDocumentStore } from "./document-store";
import { useTerminalStore } from "./terminal-store";
import { useLayoutStore } from "./layout-store";
import { modeRegistry, type RightTabKind, type RightTab } from "@/lib/mode-registry";

// ─── Re-exports ───

export type { RightTabKind, RightTab } from "@/lib/mode-registry";

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
  openFile: (fileId: string, filePath: string, name: string) => void;
  openTexworkspaceFile: (fileId: string, filePath: string, name: string) => void;
  /** Switch the texworkspace tab's active file without changing the tab title */
  setTexworkspaceActiveFile: (fileId: string) => void;
  switchToTexworkspace: (fileId: string, filePath: string, name: string) => void;
  openGitDiff: (filePath: string) => void;
  newBrowserTab: () => string;
  newTerminalTab: () => string;
  updateTerminalTabTitle: (id: string, title: string) => void;
  navigateBrowserTab: (id: string, url: string) => void;
  updateBrowserTabTitle: (id: string, title: string) => void;
  setBrowserTabLoading: (id: string, isLoading: boolean) => void;
  setTabHibernated: (id: string, hibernated: boolean) => void;
  closeTab: (id: string) => void;
  closeAllTabs: () => void;
  /** Remove all tabs of a specific kind (used when deactivating transient modes) */
  closeTabsOfKind: (kind: RightTabKind) => void;
  /** Check if any tabs of a given kind exist */
  hasTabsOfKind: (kind: RightTabKind) => boolean;
  setActiveTab: (id: string) => void;
  setTabViewMode: (id: string, mode: string) => void;
  updateTab: (id: string, partial: Partial<Pick<RightTab, "fileId" | "filePath" | "title">>) => void;
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
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === texworkspaceTab.id ? { ...t, fileId, filePath: fileId, isInitial: false } : t,
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

  openFile: (fileId: string, filePath: string, name: string) => {
    // Ensure Files mode is active and focused
    useLayoutStore.getState().activateMode("files");

    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    const defaultViewMode = ext === ".md" || ext === ".mdx" ? "preview" : "source";
    const { tabs, activeTabId } = get();
    const active = tabs.find((t) => t.id === activeTabId);
    if (active?.kind === "file" && active.isInitial) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === active.id ? { ...t, title: name, fileId, filePath, isInitial: false, viewMode: defaultViewMode } : t,
        ),
      }));
      return;
    }
    const existing = tabs.find((t) => t.kind === "file" && t.fileId === fileId);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const id = nextTabId();
    const tab: RightTab = { id, kind: "file", title: name, fileId, filePath, isInitial: false, viewMode: defaultViewMode };
    set((s) => ({ tabs: [tab, ...s.tabs], activeTabId: id }));
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
    // Always create a fresh terminal — each tab is an independent shell session.
    const id = nextTabId();
    const tab: RightTab = { id, kind: "terminal", title: modeRegistry.findByTabKind("terminal")?.initialTitle ?? "Terminal", isInitial: false };
    set((s) => ({ tabs: [tab, ...s.tabs], activeTabId: id }));
    return id;
  },

  updateTerminalTabTitle: (id: string, title: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, title } : t,
      ),
    }));
  },

  closeTab: (id: string) => {
    const closingTab = get().tabs.find((t) => t.id === id);
    if (!closingTab) return;

    // Confirm before closing a busy terminal tab (process still running)
    if (closingTab.kind === "terminal") {
      const busy = useTerminalStore.getState().sessions[closingTab.id]?.busy;
      if (busy) {
        if (!window.confirm("A process is still running. Close anyway?")) {
          return;
        }
      }
    }

    // ── Files / Browser: last tab → regenerate home tab ──
    const sameKind = get().tabs.filter((t) => t.kind === closingTab.kind);
    const isLastOfKind = sameKind.length === 1;
    const def = modeRegistry.findByTabKind(closingTab.kind);
    const isPersistent = def?.persistence === "persistent";

    if (isLastOfKind && isPersistent) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === id
            ? {
                ...t,
                title: modeRegistry.findByTabKind(t.kind)?.initialTitle ?? t.kind,
                isInitial: true,
                filePath: undefined,
                fileId: undefined,
                url: undefined,
                viewMode: undefined,
              }
            : t,
        ),
      }));
      if (closingTab.kind === "file") {
        useDocumentStore.getState().setActiveFile("");
      }
      return;
    }

    // ── Normal close ──
    set((s) => {
      const closing = s.tabs.find((t) => t.id === id);
      const next = s.tabs.filter((t) => t.id !== id);
      const closingMode = modeRegistry.findByTabKind(closing?.kind ?? "file")?.id ?? "files";

      let nextActive = s.activeTabId;
      if (s.activeTabId === id) {
        // Prefer the next tab of the SAME mode, else fallback to first tab
        const sameModeTab = next.find((t) => {
          const def = modeRegistry.findByTabKind(t.kind);
          return def?.id === closingMode;
        });
        nextActive = sameModeTab?.id ?? (next.length > 0 ? next[0].id : null);
      }
      const nextActiveTab = next.find((t) => t.id === nextActive);
      const nextFileId = (nextActiveTab?.kind === "file" || nextActiveTab?.kind === "texworkspace") && nextActiveTab.fileId ? nextActiveTab.fileId : "";
      useDocumentStore.getState().setActiveFile(nextFileId);

      // Fully release PDF file resources when closing a PDF tab
      if (closing?.kind === "file" && closing.filePath?.toLowerCase().endsWith(".pdf")) {
        // TODO: wire up Lector PDF resource cleanup
      }

      // Destroy PTY sessions when closing a terminal tab
      if (closing?.kind === "terminal") {
        window.electronAPI.terminalDestroyTab({ tabId: closing.id });
      }

      // If no tabs remain for this mode, deactivate it
      const hasRemainingOfMode = next.some((t) => {
        const def = modeRegistry.findByTabKind(t.kind);
        return def?.id === closingMode;
      });
      if (!hasRemainingOfMode && closing) {
        useLayoutStore.setState((s) => {
          const remainingModes = s.activeModes.filter((m) => m !== closingMode);
          const newFocused = remainingModes.length > 0
            ? remainingModes[remainingModes.length - 1]
            : "dashboard";
          return { activeModes: remainingModes, focusedMode: newFocused };
        });
        // Sync activeTabId to new focused mode (or null for dashboard)
        if (useLayoutStore.getState().focusedMode === "dashboard") {
          nextActive = null;
        } else {
          const newModeTab = next.find((t) => {
            const def = modeRegistry.findByTabKind(t.kind);
            return def?.id === useLayoutStore.getState().focusedMode;
          });
          nextActive = newModeTab?.id ?? null;
        }
      }

      return { tabs: next, activeTabId: nextActive };
    });
  },

  setActiveTab: (id: string) => {
    const tab = get().tabs.find((t) => t.id === id);
    set({ activeTabId: id });
    const fileId = (tab?.kind === "file" || tab?.kind === "texworkspace") && tab.fileId ? tab.fileId : "";
    useDocumentStore.getState().setActiveFile(fileId);
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
    set({ tabs: [], activeTabId: null });
    useDocumentStore.getState().setActiveFile("");
    useLayoutStore.setState({ activeModes: [], focusedMode: "dashboard" });
  },

  closeTabsOfKind: (kind: RightTabKind) => {
    set((s) => {
      const next = s.tabs.filter((t) => t.kind !== kind);
      // Destroy terminal PTY sessions when closing terminal tabs
      if (kind === "terminal") {
        s.tabs.filter((t) => t.kind === "terminal").forEach((t) => {
          window.electronAPI.terminalDestroyTab({ tabId: t.id });
        });
      }
      const nextActive = next.length > 0 ? next[0].id : null;
      if (kind === "file" || kind === "texworkspace") {
        useDocumentStore.getState().setActiveFile("");
      }
      return { tabs: next, activeTabId: nextActive };
    });
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

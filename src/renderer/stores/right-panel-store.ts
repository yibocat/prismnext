import { create } from "zustand";
import { useDocumentStore } from "./document-store";

// ─── Types ───

export type RightTabKind = "file" | "browser" | "git-overview" | "git-diff" | "texworkspace";

export interface RightTab {
  id: string;
  kind: RightTabKind;
  title: string;
  isInitial: boolean;
  filePath?: string;
  fileId?: string;
  /** Per-tab view mode. For .md files: "source" | "preview". Defaults to "source". */
  viewMode?: string;
}

// ─── Helpers ───

let _tabSeq = 0;
function nextTabId(): string {
  return `right-tab-${++_tabSeq}`;
}

const INITIAL_TITLES: Record<RightTabKind, string> = {
  file: "Untitled",
  browser: "New Tab",
  "git-overview": "Git",
  "git-diff": "Diff",
  texworkspace: "Texworkspace",
};

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
  newBrowserTab: () => void;
  closeTab: (id: string) => void;
  closeAllTabs: () => void;
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
    const tab: RightTab = { id, kind, title: INITIAL_TITLES[kind], isInitial: true };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
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
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
    }
    useDocumentStore.getState().setActiveFile(fileId);
  },

  openFile: (fileId: string, filePath: string, name: string) => {
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
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
  },

  openGitDiff: (filePath: string) => {
    const name = filePath.split("/").pop() || filePath;
    const id = nextTabId();
    const tab: RightTab = { id, kind: "git-diff", title: name, filePath, isInitial: false };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
  },

  newBrowserTab: () => {
    const { tabs, activeTabId } = get();
    const active = tabs.find((t) => t.id === activeTabId);
    if (active?.kind === "browser" && active.isInitial) return;
    const existing = tabs.find((t) => t.kind === "browser" && t.isInitial);
    if (existing) { set({ activeTabId: existing.id }); return; }
    const id = nextTabId();
    const tab: RightTab = { id, kind: "browser", title: INITIAL_TITLES.browser, isInitial: true };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
  },

  closeTab: (id: string) => {
    set((s) => {
      const closing = s.tabs.find((t) => t.id === id);
      const next = s.tabs.filter((t) => t.id !== id);
      let nextActive = s.activeTabId;
      if (s.activeTabId === id) {
        nextActive = next.length > 0 ? next[next.length - 1].id : null;
      }
      const nextActiveTab = next.find((t) => t.id === nextActive);
      const nextFileId = (nextActiveTab?.kind === "file" || nextActiveTab?.kind === "texworkspace") && nextActiveTab.fileId ? nextActiveTab.fileId : "";
      useDocumentStore.getState().setActiveFile(nextFileId);

      // Fully release PDF file resources when closing a PDF tab
      if (closing?.kind === "file" && closing.filePath?.toLowerCase().endsWith(".pdf")) {
        // TODO: wire up Lector PDF resource cleanup
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

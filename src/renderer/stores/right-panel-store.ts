import { create } from "zustand";
import { useDocumentStore } from "./document-store";

// ─── Types ───

export type RightTabKind = "file" | "browser" | "git-overview" | "git-diff" | "preview";

export interface RightTab {
  id: string;
  kind: RightTabKind;
  title: string;
  isInitial: boolean;
  filePath?: string;
  fileId?: string;
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
  preview: "Preview",
};

// ─── Store ───

interface RightPanelState {
  tabs: RightTab[];
  activeTabId: string | null;

  ensureTab: (kind: RightTabKind) => string;
  openFile: (fileId: string, filePath: string, name: string) => void;
  openPreviewFile: (fileId: string, filePath: string, name: string) => void;
  switchToPreview: (fileId: string, filePath: string, name: string) => void;
  openGitDiff: (filePath: string) => void;
  newBrowserTab: () => void;
  closeTab: (id: string) => void;
  closeAllTabs: () => void;
  setActiveTab: (id: string) => void;
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
    const id = nextTabId();
    const tab: RightTab = { id, kind, title: INITIAL_TITLES[kind], isInitial: true };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
    return id;
  },

  openPreviewFile: (fileId: string, filePath: string, name: string) => {
    const { tabs, activeTabId } = get();
    const previewTab = tabs.find((t) => t.kind === "preview" && t.id === activeTabId);
    if (!previewTab) return;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === previewTab.id ? { ...t, title: name, fileId, filePath, isInitial: false } : t,
      ),
    }));
    useDocumentStore.getState().setActiveFile(fileId);
  },

  switchToPreview: (fileId: string, filePath: string, name: string) => {
    const { tabs } = get();
    const existing = tabs.find((t) => t.kind === "preview");
    if (existing) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === existing.id ? { ...t, title: name, fileId, filePath, isInitial: false } : t,
        ),
        activeTabId: existing.id,
      }));
    } else {
      const id = nextTabId();
      const tab: RightTab = { id, kind: "preview", title: name, fileId, filePath, isInitial: false };
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
    }
    useDocumentStore.getState().setActiveFile(fileId);
  },

  openFile: (fileId: string, filePath: string, name: string) => {
    const { tabs, activeTabId } = get();
    const active = tabs.find((t) => t.id === activeTabId);
    if (active?.kind === "file" && active.isInitial) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === active.id ? { ...t, title: name, fileId, filePath, isInitial: false } : t,
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
    const tab: RightTab = { id, kind: "file", title: name, fileId, filePath, isInitial: false };
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
      const next = s.tabs.filter((t) => t.id !== id);
      let nextActive = s.activeTabId;
      if (s.activeTabId === id) {
        nextActive = next.length > 0 ? next[next.length - 1].id : null;
      }
      const nextActiveTab = next.find((t) => t.id === nextActive);
      const nextFileId = (nextActiveTab?.kind === "file" || nextActiveTab?.kind === "preview") && nextActiveTab.fileId ? nextActiveTab.fileId : "";
      useDocumentStore.getState().setActiveFile(nextFileId);
      return { tabs: next, activeTabId: nextActive };
    });
  },

  setActiveTab: (id: string) => {
    const tab = get().tabs.find((t) => t.id === id);
    set({ activeTabId: id });
    const fileId = (tab?.kind === "file" || tab?.kind === "preview") && tab.fileId ? tab.fileId : "";
    useDocumentStore.getState().setActiveFile(fileId);
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

import { create } from "zustand";

// ─── Types ───

export type RightTabKind = "file" | "browser" | "git-overview" | "git-diff";

export interface RightTab {
  id: string;
  kind: RightTabKind;
  title: string;
  isInitial: boolean;
  /** File path (for "file" tabs) */
  filePath?: string;
  /** Document store file ID (for "file" tabs) */
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
};

// ─── Store ───

interface RightPanelState {
  tabs: RightTab[];
  activeTabId: string | null;

  /** Switch to a mode. Finds existing initial tab or creates one. */
  ensureTab: (kind: RightTabKind) => string;

  /** Open a file from the file tree. Transforms current empty initial tab or creates new. */
  openFile: (fileId: string, filePath: string, name: string) => void;

  /** Open a git diff from the sidebar. */
  openGitDiff: (filePath: string) => void;

  /** Create a new browser tab. If current is empty initial browser, reuse it. */
  newBrowserTab: () => void;

  /** Mark a tab as no longer initial (i.e., it has real content now). */
  markUsed: (tabId: string) => void;

  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
}

export const useRightPanelStore = create<RightPanelState>()((set, get) => ({
  tabs: [],
  activeTabId: null,

  ensureTab: (kind: RightTabKind) => {
    const { tabs } = get();
    // Find existing unused initial tab of this kind
    const existing = tabs.find((t) => t.kind === kind && t.isInitial);
    if (existing) {
      set({ activeTabId: existing.id });
      return existing.id;
    }
    // Create new initial tab
    const id = nextTabId();
    const tab: RightTab = {
      id,
      kind,
      title: INITIAL_TITLES[kind],
      isInitial: true,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
    return id;
  },

  openFile: (fileId: string, filePath: string, name: string) => {
    const { tabs, activeTabId } = get();

    // If current tab is an empty initial file tab, reuse it
    const active = tabs.find((t) => t.id === activeTabId);
    if (active?.kind === "file" && active.isInitial) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === active.id
            ? { ...t, title: name, fileId, filePath, isInitial: false }
            : t,
        ),
      }));
      return;
    }

    // If file is already open in another tab, switch to it
    const existing = tabs.find((t) => t.kind === "file" && t.fileId === fileId);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }

    // Otherwise create new file tab
    const id = nextTabId();
    const tab: RightTab = {
      id,
      kind: "file",
      title: name,
      fileId,
      filePath,
      isInitial: false,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
  },

  openGitDiff: (filePath: string) => {
    const name = filePath.split("/").pop() || filePath;
    const id = nextTabId();
    const tab: RightTab = {
      id,
      kind: "git-diff",
      title: name,
      filePath,
      isInitial: false,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
  },

  newBrowserTab: () => {
    const { tabs, activeTabId } = get();
    const active = tabs.find((t) => t.id === activeTabId);

    // If current is empty initial browser, reuse it
    if (active?.kind === "browser" && active.isInitial) return;

    // Check if there's any unused initial browser tab
    const existing = tabs.find((t) => t.kind === "browser" && t.isInitial);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }

    // Create new browser tab
    const id = nextTabId();
    const tab: RightTab = {
      id,
      kind: "browser",
      title: INITIAL_TITLES.browser,
      isInitial: true,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
  },

  markUsed: (tabId: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId && t.isInitial ? { ...t, isInitial: false } : t,
      ),
    }));
  },

  closeTab: (id: string) => {
    set((s) => {
      const next = s.tabs.filter((t) => t.id !== id);
      let nextActive = s.activeTabId;
      if (s.activeTabId === id) {
        nextActive = next.length > 0 ? next[next.length - 1].id : null;
      }
      return { tabs: next, activeTabId: nextActive };
    });
  },

  setActiveTab: (id: string) => set({ activeTabId: id }),
}));

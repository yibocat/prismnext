import { create } from "zustand";
import { useDocumentStore } from "@/stores/document-store";
import type { BrowserBookmark, BrowserRecentVisit } from "@/types/electron";
import type { OmniboxAnchor } from "@/lib/browser/omnibox";

/** Normalize URL for comparison: strip trailing slash, fragment, www prefix */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    let path = u.pathname;
    if (path.endsWith("/") && path !== "/") path = path.slice(0, -1);
    return `${u.protocol}//${u.hostname.replace(/^www\./, "")}${path}${u.search}`;
  } catch {
    return url;
  }
}

interface BrowserState {
  bookmarks: BrowserBookmark[];
  recentVisits: BrowserRecentVisit[];
  maxRecentItems: number;
  loaded: boolean;
  omniboxOpen: boolean;
  omniboxQuery: string;
  omniboxActiveIndex: number;
  omniboxAnchor: OmniboxAnchor | null;

  loadFromProject: (projectRoot: string) => Promise<void>;
  addBookmark: (title: string, url: string) => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
  renameBookmark: (id: string, title: string) => void;
  changeBookmarkUrl: (id: string, url: string) => void;
  recordVisit: (url: string, title: string) => Promise<void>;
  removeRecentVisit: (url: string) => Promise<void>;
  clearRecentVisits: () => Promise<void>;
  openOmnibox: (query: string) => void;
  setOmniboxQuery: (query: string) => void;
  setOmniboxActiveIndex: (index: number) => void;
  setOmniboxAnchor: (anchor: OmniboxAnchor | null) => void;
  closeOmnibox: () => void;
}

function getProjectRoot(): string | null {
  return useDocumentStore.getState().projectRoot;
}

function persistBookmarks(bookmarks: BrowserBookmark[]): void {
  void window.electronAPI.browserSaveBookmarks(getProjectRoot() ?? "", bookmarks);
}

function persistRecent(recent: BrowserRecentVisit[]): void {
  void window.electronAPI.browserSaveRecent(getProjectRoot() ?? "", recent);
}

export const useBrowserStore = create<BrowserState>()((set, get) => ({
  bookmarks: [],
  recentVisits: [],
  // TODO: future — read maxRecentItems from user settings panel instead of hardcoding 50
  maxRecentItems: 50,
  loaded: false,
  omniboxOpen: false,
  omniboxQuery: "",
  omniboxActiveIndex: 0,
  omniboxAnchor: null,

  loadFromProject: async (projectRoot?: string) => {
    const data = await window.electronAPI.browserInit(projectRoot ?? "");
    set({
      bookmarks: data.bookmarks,
      recentVisits: data.recent,
      maxRecentItems: data.maxRecentItems ?? 50,
      loaded: true,
    });
  },

  addBookmark: async (title: string, url: string) => {
    const { bookmarks } = get();
    if (bookmarks.some((b) => normalizeUrl(b.url) === normalizeUrl(url))) return;
    const newBookmark: BrowserBookmark = {
      id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      url,
      favicon: "",
      createdAt: Date.now(),
      order: bookmarks.length,
    };
    const updated = [...bookmarks, newBookmark];
    set({ bookmarks: updated });
    persistBookmarks(updated);
  },

  removeBookmark: async (id: string) => {
    const updated = get().bookmarks.filter((b) => b.id !== id);
    set({ bookmarks: updated });
    persistBookmarks(updated);
  },

  renameBookmark: (id: string, title: string) => {
    const updated = get().bookmarks.map((b) =>
      b.id === id ? { ...b, title } : b,
    );
    set({ bookmarks: updated });
    persistBookmarks(updated);
  },

  changeBookmarkUrl: (id: string, url: string) => {
    const updated = get().bookmarks.map((b) =>
      b.id === id ? { ...b, url } : b,
    );
    set({ bookmarks: updated });
    persistBookmarks(updated);
  },

  recordVisit: async (url: string, title: string) => {
    const { recentVisits, maxRecentItems } = get();
    const filtered = recentVisits.filter((v) => normalizeUrl(v.url) !== normalizeUrl(url));
    const entry: BrowserRecentVisit = { url, title, visitedAt: Date.now() };
    const updated = [entry, ...filtered].slice(0, maxRecentItems);
    set({ recentVisits: updated });
    persistRecent(updated);
  },

  removeRecentVisit: async (url: string) => {
    const updated = get().recentVisits.filter((v) => normalizeUrl(v.url) !== normalizeUrl(url));
    set({ recentVisits: updated });
    persistRecent(updated);
  },

  clearRecentVisits: async () => {
    set({ recentVisits: [] });
    persistRecent([]);
  },

  openOmnibox: (query: string) => {
    set({
      omniboxOpen: true,
      omniboxQuery: query,
      omniboxActiveIndex: query.trim() ? 0 : -1,
    });
  },

  setOmniboxQuery: (query: string) => {
    set({
      omniboxOpen: true,
      omniboxQuery: query,
      omniboxActiveIndex: query.trim() ? 0 : -1,
    });
  },

  setOmniboxActiveIndex: (index: number) => {
    set({ omniboxActiveIndex: Math.max(-1, index) });
  },

  setOmniboxAnchor: (anchor) => {
    set({ omniboxAnchor: anchor });
  },

  closeOmnibox: () => {
    set({
      omniboxOpen: false,
      omniboxQuery: "",
      omniboxActiveIndex: 0,
      omniboxAnchor: null,
    });
  },
}));

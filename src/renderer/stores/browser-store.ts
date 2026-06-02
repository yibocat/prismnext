import { create } from "zustand";
import { useDocumentStore } from "@/stores/document-store";
import type { BrowserBookmark, BrowserRecentVisit } from "@/types/electron";

interface BrowserState {
  bookmarks: BrowserBookmark[];
  recentVisits: BrowserRecentVisit[];
  maxRecentItems: number;
  loaded: boolean;

  loadFromProject: (projectRoot: string) => Promise<void>;
  addBookmark: (title: string, url: string) => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
  recordVisit: (url: string, title: string) => Promise<void>;
  removeRecentVisit: (url: string) => Promise<void>;
  clearRecentVisits: () => Promise<void>;
}

function getProjectRoot(): string | null {
  return useDocumentStore.getState().projectRoot;
}

function persistBookmarks(bookmarks: BrowserBookmark[]): void {
  const root = getProjectRoot();
  if (root) window.electronAPI.browserSaveBookmarks(root, bookmarks);
}

function persistRecent(recent: BrowserRecentVisit[]): void {
  const root = getProjectRoot();
  if (root) window.electronAPI.browserSaveRecent(root, recent);
}

export const useBrowserStore = create<BrowserState>()((set, get) => ({
  bookmarks: [],
  recentVisits: [],
  // TODO: future — read maxRecentItems from user settings panel instead of hardcoding 50
  maxRecentItems: 50,
  loaded: false,

  loadFromProject: async (projectRoot: string) => {
    if (!projectRoot) return;
    const data = await window.electronAPI.browserInit(projectRoot);
    set({
      bookmarks: data.bookmarks,
      recentVisits: data.recent,
      maxRecentItems: data.maxRecentItems,
      loaded: true,
    });
  },

  addBookmark: async (title: string, url: string) => {
    const { bookmarks } = get();
    if (bookmarks.some((b) => b.url === url)) return;
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

  recordVisit: async (url: string, title: string) => {
    const { recentVisits, maxRecentItems } = get();
    const filtered = recentVisits.filter((v) => v.url !== url);
    const entry: BrowserRecentVisit = { url, title, visitedAt: Date.now() };
    const updated = [entry, ...filtered].slice(0, maxRecentItems);
    set({ recentVisits: updated });
    persistRecent(updated);
  },

  removeRecentVisit: async (url: string) => {
    const updated = get().recentVisits.filter((v) => v.url !== url);
    set({ recentVisits: updated });
    persistRecent(updated);
  },

  clearRecentVisits: async () => {
    set({ recentVisits: [] });
    persistRecent([]);
  },
}));

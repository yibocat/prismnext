import { create } from "zustand";
import type { LogLevel, LogCategory, LogEntry } from "@shared/log-types";
import { logBuffer } from "@/services/logger";

interface LogState {
  // View state
  filterCategory: LogCategory | "all";
  /** Exclusive level tab — "all" shows every level. */
  filterLevel: LogLevel | "all";
  search: string;
  entries: LogEntry[];

  // Actions
  setFilterCategory: (c: LogCategory | "all") => void;
  setFilterLevel: (l: LogLevel | "all") => void;
  setSearch: (s: string) => void;
  refresh: () => void;

  // Main process logs (fetched on demand)
  mainEntries: LogEntry[];
  fetchMainLogs: () => Promise<void>;

  // Export
  exportLogs: () => string;
}

function detailSearchText(detail: unknown): string {
  if (detail == null) return "";
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

/** Newest first — Settings log viewer pins fresh activity at the top. */
export function filterLogEntries(
  mainEntries: LogEntry[],
  filterCategory: LogCategory | "all",
  filterLevel: LogLevel | "all",
  search: string,
): LogEntry[] {
  const all = [...mainEntries, ...logBuffer].sort((a, b) => b.ts - a.ts || b.id - a.id);

  let filtered = all;
  if (filterCategory !== "all") {
    filtered = filtered.filter((e) => e.category === filterCategory);
  }
  if (filterLevel !== "all") {
    filtered = filtered.filter((e) => e.level === filterLevel);
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((e) => {
      if (e.message.toLowerCase().includes(q) || e.module.toLowerCase().includes(q)) {
        return true;
      }
      const detail = detailSearchText(e.detail).toLowerCase();
      return detail.includes(q);
    });
  }
  return filtered;
}

export const useLogStore = create<LogState>((set, get) => ({
  filterCategory: "all",
  filterLevel: "all",
  search: "",
  entries: [],
  mainEntries: [],

  setFilterCategory: (c) => {
    set((s) => ({
      filterCategory: c,
      entries: filterLogEntries(s.mainEntries, c, s.filterLevel, s.search),
    }));
  },

  setFilterLevel: (l) => {
    set((s) => ({
      filterLevel: l,
      entries: filterLogEntries(s.mainEntries, s.filterCategory, l, s.search),
    }));
  },

  setSearch: (s) => {
    set((state) => ({
      search: s,
      entries: filterLogEntries(state.mainEntries, state.filterCategory, state.filterLevel, s),
    }));
  },

  refresh: () => {
    const { filterCategory, filterLevel, search, mainEntries } = get();
    set({ entries: filterLogEntries(mainEntries, filterCategory, filterLevel, search) });
  },

  fetchMainLogs: async () => {
    try {
      const result = await window.electronAPI.logFetch({
        category: get().filterCategory === "all" ? undefined : get().filterCategory as LogCategory,
        limit: 2000,
      });
      set({ mainEntries: result.entries });
      get().refresh();
    } catch {
      // IPC not available (e.g., in dev without main process)
    }
  },

  exportLogs: (): string => {
    const lines: string[] = [];
    for (const e of get().entries) {
      const ts = new Date(e.ts).toISOString();
      const base = `${ts} [${e.level.toUpperCase()}] [${e.process}:${e.category}] ${e.module}: ${e.message}`;
      lines.push(e.detail !== undefined ? `${base} ${JSON.stringify(e.detail)}` : base);
    }
    return lines.join("\n");
  },
}));

import { create } from "zustand";
import type { LogLevel, LogCategory, LogEntry } from "@shared/log-types";
import { logBuffer } from "@/services/logger";

interface LogState {
  // View state
  filterCategory: LogCategory | "all";
  filterLevel: LogLevel;
  search: string;
  entries: LogEntry[];

  // Actions
  setFilterCategory: (c: LogCategory | "all") => void;
  setFilterLevel: (l: LogLevel) => void;
  setSearch: (s: string) => void;
  refresh: () => void;

  // Main process logs (fetched on demand)
  mainEntries: LogEntry[];
  fetchMainLogs: () => Promise<void>;

  // Export
  exportLogs: () => string;
}

export const useLogStore = create<LogState>((set, get) => ({
  filterCategory: "all",
  filterLevel: "debug",
  search: "",
  entries: [],
  mainEntries: [],

  setFilterCategory: (c) => {
    set({ filterCategory: c });
    get().refresh();
  },

  setFilterLevel: (l) => {
    set({ filterLevel: l });
    get().refresh();
  },

  setSearch: (s) => {
    set({ search: s });
    get().refresh();
  },

  refresh: () => {
    const { filterCategory, filterLevel, search } = get();

    // Merge main + renderer logs, sorted by id
    const all = [...get().mainEntries, ...logBuffer].sort((a, b) => a.id - b.id);

    let filtered = all;
    if (filterCategory !== "all") {
      filtered = filtered.filter((e) => e.category === filterCategory);
    }
    const LEVEL_ORDER: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
    filtered = filtered.filter((e) => LEVEL_ORDER[e.level] >= LEVEL_ORDER[filterLevel]);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.message.toLowerCase().includes(q) ||
          e.module.toLowerCase().includes(q),
      );
    }

    set({ entries: filtered });
  },

  fetchMainLogs: async () => {
    try {
      const result = await window.electronAPI.logFetch({
        category: get().filterCategory === "all" ? undefined : get().filterCategory as LogCategory,
        level: get().filterLevel,
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

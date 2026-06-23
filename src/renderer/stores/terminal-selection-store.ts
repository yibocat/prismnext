import { create } from "zustand";

interface TerminalSelectionState {
  getters: Record<string, () => string>;
  register: (tabId: string, getter: () => string) => void;
  unregister: (tabId: string) => void;
  getSelection: (tabId: string) => string;
}

export const useTerminalSelectionStore = create<TerminalSelectionState>()((set, get) => ({
  getters: {},

  register: (tabId, getter) => {
    set((s) => ({ getters: { ...s.getters, [tabId]: getter } }));
  },

  unregister: (tabId) => {
    set((s) => {
      const next = { ...s.getters };
      delete next[tabId];
      return { getters: next };
    });
  },

  getSelection: (tabId) => {
    try {
      return get().getters[tabId]?.() ?? "";
    } catch {
      return "";
    }
  },
}));

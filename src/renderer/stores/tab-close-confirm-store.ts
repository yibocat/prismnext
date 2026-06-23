import { create } from "zustand";
import type { TabCloseConfirmation } from "@/lib/workspace/tab-close-confirmation";

interface TabCloseConfirmState {
  pending: (TabCloseConfirmation & { onConfirm: () => void }) | null;
  open: (request: TabCloseConfirmation & { onConfirm: () => void }) => void;
  confirm: () => void;
  cancel: () => void;
}

export const useTabCloseConfirmStore = create<TabCloseConfirmState>()((set, get) => ({
  pending: null,

  open: (request) => {
    set({ pending: request });
  },

  confirm: () => {
    const pending = get().pending;
    if (!pending) return;
    set({ pending: null });
    pending.onConfirm();
  },

  cancel: () => {
    set({ pending: null });
  },
}));

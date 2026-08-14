import { create } from "zustand";
import type { TabCloseConfirmation } from "@/lib/workspace/tab-close-confirmation";

export type TabCloseConfirmRequest = TabCloseConfirmation & {
  onConfirm: () => void;
  onSecondary?: () => void;
  onDismiss?: () => void;
};

interface TabCloseConfirmState {
  pending: TabCloseConfirmRequest | null;
  open: (request: TabCloseConfirmRequest) => void;
  confirm: () => void;
  secondary: () => void;
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

  secondary: () => {
    const pending = get().pending;
    if (!pending) return;
    set({ pending: null });
    pending.onSecondary?.();
  },

  cancel: () => {
    const pending = get().pending;
    if (!pending) return;
    set({ pending: null });
    pending.onDismiss?.();
  },
}));

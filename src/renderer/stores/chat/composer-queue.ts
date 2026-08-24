import type { StateCreator } from "zustand";
import type { ChatState } from "./model";
import {
  combineComposerQueueItems,
  type ComposerQueueItem,
} from "@/lib/chat/composer-send-queue";

export const createChatComposerQueueSlice: StateCreator<ChatState, [], [], Partial<ChatState>> = (set, get) => ({
  enqueueComposerSend: (tabId, item) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, composerSendQueue: [...t.composerSendQueue, item] }
          : t,
      ),
    }));
  },

  removeComposerSend: (tabId, itemId) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              composerSendQueue: t.composerSendQueue.filter((q) => q.id !== itemId),
            }
          : t,
      ),
    }));
  },

  prioritizeComposerSend: (tabId, itemId) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const idx = t.composerSendQueue.findIndex((q) => q.id === itemId);
        if (idx <= 0) return t;
        const item = t.composerSendQueue[idx];
        const rest = t.composerSendQueue.filter((q) => q.id !== itemId);
        return {
          ...t,
          composerSendQueue: [item, ...rest],
        };
      }),
    }));
  },

  commitComposerQueueFlush: (tabId) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId || t.composerSendQueue.length === 0) return t;
        const combined = combineComposerQueueItems(t.composerSendQueue);
        // If a previous flush is still waiting, fold it in front of the new combine.
        const pending = t.composerQueuePendingFlush
          ? combineComposerQueueItems([t.composerQueuePendingFlush, combined])
          : combined;
        return {
          ...t,
          composerSendQueue: [],
          composerQueuePendingFlush: pending,
        };
      }),
    }));
  },

  promoteComposerSendToPendingFlush: (tabId, itemId) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const idx = t.composerSendQueue.findIndex((q) => q.id === itemId);
        if (idx < 0) return t;
        const item = t.composerSendQueue[idx]!;
        const rest = t.composerSendQueue.filter((q) => q.id !== itemId);
        const pending = t.composerQueuePendingFlush
          ? combineComposerQueueItems([item, t.composerQueuePendingFlush])
          : item;
        return {
          ...t,
          composerSendQueue: rest,
          composerQueuePendingFlush: pending,
        };
      }),
    }));
  },

  clearComposerSendQueue: (tabId) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, composerSendQueue: [], composerQueuePendingFlush: null }
          : t,
      ),
    }));
  },

  takeComposerSendQueueHead: (tabId) => {
    let taken: ComposerQueueItem | null = null;
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId || t.composerSendQueue.length === 0) return t;
        const [head, ...rest] = t.composerSendQueue;
        taken = head;
        return {
          ...t,
          composerSendQueue: rest,
        };
      }),
    }));
    return taken;
  },

  takeComposerSendQueueCombined: (tabId) => {
    let taken: ComposerQueueItem | null = null;
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId || t.composerSendQueue.length === 0) return t;
        taken = combineComposerQueueItems(t.composerSendQueue);
        return {
          ...t,
          composerSendQueue: [],
        };
      }),
    }));
    return taken;
  },

  takeComposerQueuePendingFlush: (tabId) => {
    let taken: ComposerQueueItem | null = null;
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId || !t.composerQueuePendingFlush) return t;
        taken = t.composerQueuePendingFlush;
        return { ...t, composerQueuePendingFlush: null };
      }),
    }));
    return taken;
  },

});

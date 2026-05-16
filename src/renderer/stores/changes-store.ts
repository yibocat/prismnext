import { create } from "zustand";
import { useDocumentStore } from "./document-store";

export interface ProposedChange {
  id: string; // tool_use_id
  filePath: string; // relativePath
  absolutePath: string;
  oldContent: string; // content before Claude's edit
  newContent: string; // content after Claude's edit
  toolName: string; // "Edit" | "Write" | "MultiEdit"
  timestamp: number;
}

interface ChangesState {
  changes: ProposedChange[];

  addChange: (change: Omit<ProposedChange, "timestamp">) => void;
  acceptChange: (id: string) => Promise<void>;
  rejectChange: (id: string) => Promise<void>;
  acceptAll: () => Promise<void>;
  rejectAll: () => Promise<void>;
  getChangeForFile: (relativePath: string) => ProposedChange | undefined;
}

export const useChangesStore = create<ChangesState>()((set, get) => ({
  changes: [],

  addChange: (change) => {
    set((state) => {
      const existingIdx = state.changes.findIndex(
        (c) => c.filePath === change.filePath,
      );
      if (existingIdx >= 0) {
        const existing = state.changes[existingIdx];
        const merged: ProposedChange = {
          ...change,
          oldContent: existing.oldContent,
          timestamp: Date.now(),
        };
        const newChanges = [...state.changes];
        newChanges[existingIdx] = merged;
        return { changes: newChanges };
      }
      return {
        changes: [...state.changes, { ...change, timestamp: Date.now() }],
      };
    });
  },

  acceptChange: async (id) => {
    const change = get().changes.find((c) => c.id === id);
    if (!change) return;

    const docState = useDocumentStore.getState();
    const file = docState.files.find((f) => f.relativePath === change.filePath);
    if (!file) {
      set((state) => ({ changes: state.changes.filter((c) => c.id !== id) }));
      return;
    }

    try {
      await window.electronAPI.fsWrite(change.absolutePath, change.newContent);
      await docState.refreshFileContent(file.id);
    } catch (err) {
      console.error("[changes] acceptChange write failed:", err);
      return; // don't remove from store on failure
    }

    set((state) => ({
      changes: state.changes.filter((c) => c.id !== id),
    }));
  },

  rejectChange: async (id) => {
    const change = get().changes.find((c) => c.id === id);
    if (!change) return;

    const docState = useDocumentStore.getState();
    const file = docState.files.find((f) => f.relativePath === change.filePath);

    try {
      await window.electronAPI.fsWrite(change.absolutePath, change.oldContent);
      if (file) {
        await docState.refreshFileContent(file.id);
      }
    } catch (err) {
      console.error("[changes] rejectChange write failed:", err);
      return; // don't remove from store on failure
    }

    set((state) => ({
      changes: state.changes.filter((c) => c.id !== id),
    }));
  },

  acceptAll: async () => {
    const { changes } = get();
    if (changes.length === 0) return;

    const docState = useDocumentStore.getState();
    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const change of changes) {
      try {
        const file = docState.files.find((f) => f.relativePath === change.filePath);
        if (file) {
          await window.electronAPI.fsWrite(change.absolutePath, change.newContent);
          await docState.refreshFileContent(file.id);
        }
        succeeded.push(change.id);
      } catch (err) {
        console.error("[changes] acceptAll failed for", change.filePath, err);
        failed.push(change.id);
      }
    }

    if (failed.length > 0) {
      console.warn("[changes] acceptAll: some writes failed", { succeeded, failed });
    }

    set((state) => ({
      changes: state.changes.filter((c) => !succeeded.includes(c.id)),
    }));
  },

  rejectAll: async () => {
    const { changes } = get();
    if (changes.length === 0) return;

    const docState = useDocumentStore.getState();
    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const change of changes) {
      try {
        await window.electronAPI.fsWrite(change.absolutePath, change.oldContent);
        const file = docState.files.find((f) => f.relativePath === change.filePath);
        if (file) {
          await docState.refreshFileContent(file.id);
        }
        succeeded.push(change.id);
      } catch (err) {
        console.error("[changes] rejectAll failed for", change.filePath, err);
        failed.push(change.id);
      }
    }

    if (failed.length > 0) {
      console.warn("[changes] rejectAll: some writes failed", { succeeded, failed });
    }

    set((state) => ({
      changes: state.changes.filter((c) => !succeeded.includes(c.id)),
    }));
  },

  getChangeForFile: (relativePath) => {
    return get().changes.find((c) => c.filePath === relativePath);
  },
}));

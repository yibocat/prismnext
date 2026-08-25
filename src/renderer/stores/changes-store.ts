import { create } from "zustand";
import { fsDesktop } from "@/lib/desktop-api/fs";
import { useDocumentStore } from "./document-store";
import { useChatStore } from "./chat-store";

export interface ProposedChange {
  id: string; // tool_use_id
  filePath: string; // relativePath
  absolutePath: string;
  oldContent: string; // content before OpenCode's edit
  newContent: string; // content after OpenCode's edit
  toolName: string; // "Edit" | "Write" | "MultiEdit"
  timestamp: number;
}

interface ChangesState {
  changes: ProposedChange[];

  addChange: (change: Omit<ProposedChange, "timestamp">) => void;
  removeChange: (id: string) => void;
  acceptChange: (id: string) => Promise<void>;
  rejectChange: (id: string) => Promise<void>;
  acceptAll: () => Promise<void>;
  rejectAll: () => Promise<void>;
  clearAll: () => void;
  getChangeForFile: (relativePath: string) => ProposedChange | undefined;
}

async function sealAcceptedIntoCheckpoint(change: ProposedChange): Promise<void> {
  const { useCheckpointStore } = await import("./checkpoint-store");
  const tabId = useChatStore.getState().activeTabId;
  if (!tabId) return;
  const created = change.oldContent === "" && change.toolName.toLowerCase().includes("write");
  await useCheckpointStore.getState().sealFileIntoLatestCheckpoint(
    tabId,
    {
      relativePath: change.filePath,
      absolutePath: change.absolutePath,
      content: change.newContent,
    },
    { created },
  );
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

    // Mark during the active turn so finalizeTurn includes this path.
    void import("./checkpoint-store").then(({ useCheckpointStore }) => {
      const tabId = useChatStore.getState().activeTabId;
      if (!tabId) return;
      const created = change.oldContent === "";
      useCheckpointStore.getState().noteFileMutation(
        tabId,
        change.filePath,
        change.absolutePath,
        change.oldContent,
        { created },
      );
    });
  },

  removeChange: (id) => {
    set((state) => ({
      changes: state.changes.filter((c) => c.id !== id),
    }));
  },

  acceptChange: async (id) => {
    const change = get().changes.find((c) => c.id === id);
    if (!change) return;

    try {
      await fsDesktop.fsWrite(change.absolutePath, change.newContent);
      const docState = useDocumentStore.getState();
      const file = docState.files.find((f) => f.relativePath === change.filePath);
      if (file) {
        await docState.refreshFileContent(file.id);
      } else {
        await docState.refreshFiles();
      }
      await sealAcceptedIntoCheckpoint(change);
    } catch (err) {
      console.error("[changes] acceptChange write failed:", err);
      return;
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
      await fsDesktop.fsWrite(change.absolutePath, change.oldContent);
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

    for (const change of changes) {
      try {
        await fsDesktop.fsWrite(change.absolutePath, change.newContent);
        const file = docState.files.find((f) => f.relativePath === change.filePath);
        if (file) {
          await docState.refreshFileContent(file.id);
        }
        await sealAcceptedIntoCheckpoint(change);
        succeeded.push(change.id);
      } catch (err) {
        console.error("[changes] acceptAll failed for", change.filePath, err);
      }
    }

    if (succeeded.length < changes.length) {
      await docState.refreshFiles();
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
        await fsDesktop.fsWrite(change.absolutePath, change.oldContent);
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

  clearAll: () => set({ changes: [] }),
}));

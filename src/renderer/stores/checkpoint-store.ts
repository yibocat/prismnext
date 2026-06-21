import { create } from "zustand";
import { useDocumentStore } from "./document-store";
import { useWorktreeStore } from "./worktree-store";
import { useChangesStore } from "./changes-store";
import { useChatStore, type ChatStreamMessage } from "./chat-store";
import { createLogger } from "@/services/logger";

const log = createLogger("checkpoint-store");

export interface CheckpointFile {
  relativePath: string;
  absolutePath: string;
  content: string;
}

/** Snapshot of workspace files at the end of one chat turn (user → assistant). */
export interface TurnCheckpoint {
  /** 0-based index matching chat-messages `turns` array */
  turnIndex: number;
  createdAt: number;
  files: CheckpointFile[];
  /** Relative paths modified during this turn only */
  touchedThisTurn: string[];
}

interface PendingTurn {
  turnIndex: number;
  /** Content before the first mutation in this turn */
  beforeByPath: Map<string, string>;
  touchedPaths: Set<string>;
}

interface RestoreUndoState {
  files: CheckpointFile[];
  checkpoints: TurnCheckpoint[];
  messages: ChatStreamMessage[];
}

interface TabCheckpointState {
  sessionId: string | null;
  checkpoints: TurnCheckpoint[];
  pendingTurn: PendingTurn | null;
  /** Single-step undo: workspace + checkpoints before the last restore */
  restoreUndo: RestoreUndoState | null;
}

interface CheckpointStoreState {
  byTab: Record<string, TabCheckpointState>;

  initSession: (tabId: string, sessionId: string) => Promise<void>;
  setSessionId: (tabId: string, sessionId: string) => void;
  clearTab: (tabId: string) => void;
  beginTurn: (tabId: string, turnIndex: number) => void;
  noteFileMutation: (
    tabId: string,
    relativePath: string,
    absolutePath: string,
    beforeContent: string,
  ) => void;
  finalizeTurn: (tabId: string, success: boolean) => Promise<void>;
  getCheckpoint: (tabId: string, turnIndex: number) => TurnCheckpoint | null;
  getLatestCheckpoint: (tabId: string) => TurnCheckpoint | null;
  restoreToTurn: (tabId: string, turnIndex: number) => Promise<number>;
  restorePreviousTurn: (tabId: string) => Promise<number | null>;
  undoLastRestore: (tabId: string) => Promise<boolean>;
  canRestoreToTurn: (tabId: string, turnIndex: number) => boolean;
  canUndoRestore: (tabId: string) => boolean;
}

function emptyTabState(): TabCheckpointState {
  return {
    sessionId: null,
    checkpoints: [],
    pendingTurn: null,
    restoreUndo: null,
  };
}

function checkpointPath(projectRoot: string, sessionId: string): string {
  return `${projectRoot}/.prismnext/agent/checkpoints/${sessionId}.json`;
}

async function readFileSnapshot(
  relativePath: string,
  absolutePath: string,
): Promise<string> {
  const docState = useDocumentStore.getState();
  const file = docState.files.find((f) => f.relativePath === relativePath);
  if (file) {
    await docState.refreshFileContent(file.id);
    const content = docState.getContent(file.id);
    if (content != null) return content;
  }
  try {
    const exists = await window.electronAPI.fsExists(absolutePath);
    if (!exists) return "";
    const result = await window.electronAPI.fsRead(absolutePath);
    return result?.content ?? "";
  } catch {
    return "";
  }
}

async function persistCheckpoints(
  projectRoot: string,
  sessionId: string,
  checkpoints: TurnCheckpoint[],
): Promise<void> {
  const path = checkpointPath(projectRoot, sessionId);
  const dir = path.slice(0, path.lastIndexOf("/"));
  try {
    await window.electronAPI.fsMkdir(dir);
    await window.electronAPI.fsWrite(
      path,
      JSON.stringify({ sessionId, checkpoints, updatedAt: Date.now() }, null, 2),
    );
  } catch (err) {
    log.warn("Failed to persist checkpoints", { error: (err as Error).message });
  }
}

async function loadCheckpointsFromDisk(
  projectRoot: string,
  sessionId: string,
): Promise<TurnCheckpoint[]> {
  const path = checkpointPath(projectRoot, sessionId);
  try {
    const exists = await window.electronAPI.fsExists(path);
    if (!exists) return [];
    const result = await window.electronAPI.fsRead(path);
    const data = result?.content ? JSON.parse(result.content) : {};
    return Array.isArray(data.checkpoints) ? data.checkpoints : [];
  } catch {
    return [];
  }
}

async function applyCheckpointFiles(files: CheckpointFile[]): Promise<void> {
  const docState = useDocumentStore.getState();
  for (const file of files) {
    try {
      const exists = await window.electronAPI.fsExists(file.absolutePath);
      if (file.content === "" && !exists) continue;
      await window.electronAPI.fsWrite(file.absolutePath, file.content);
    } catch (err) {
      log.warn(`Failed to restore ${file.relativePath}`, { error: (err as Error).message });
    }
  }
  await docState.refreshFiles();
  for (const file of files) {
    const docFile = docState.files.find((f) => f.relativePath === file.relativePath);
    if (docFile) {
      await docState.refreshFileContent(docFile.id);
    }
  }
}

function snapshotFromCheckpoints(checkpoints: TurnCheckpoint[]): CheckpointFile[] {
  const map = new Map<string, CheckpointFile>();
  for (const cp of checkpoints) {
    for (const f of cp.files) {
      map.set(f.relativePath, f);
    }
  }
  return [...map.values()];
}

function sessionPaths() {
  const projectRoot = useDocumentStore.getState().projectRoot || "";
  const worktreePath = useWorktreeStore.getState().activeWorktree?.path;
  return { projectRoot, worktreePath };
}

export const useCheckpointStore = create<CheckpointStoreState>()((set, get) => ({
  byTab: {},

  initSession: async (tabId, sessionId) => {
    const projectRoot = useDocumentStore.getState().projectRoot;
    const existing = get().byTab[tabId];
    let checkpoints: TurnCheckpoint[] = existing?.checkpoints ?? [];
    if (projectRoot && checkpoints.length === 0) {
      checkpoints = await loadCheckpointsFromDisk(projectRoot, sessionId);
    }
    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: {
          sessionId,
          checkpoints,
          pendingTurn: existing?.pendingTurn ?? null,
          restoreUndo: existing?.restoreUndo ?? null,
        },
      },
    }));
  },

  setSessionId: (tabId, sessionId) => {
    set((s) => {
      const tab = s.byTab[tabId] ?? emptyTabState();
      return {
        byTab: {
          ...s.byTab,
          [tabId]: { ...tab, sessionId },
        },
      };
    });
    void get().initSession(tabId, sessionId);
  },

  clearTab: (tabId) => {
    set((s) => {
      const next = { ...s.byTab };
      delete next[tabId];
      return { byTab: next };
    });
  },

  beginTurn: (tabId, turnIndex) => {
    set((s) => {
      const tab = s.byTab[tabId] ?? emptyTabState();
      return {
        byTab: {
          ...s.byTab,
          [tabId]: {
            ...tab,
            pendingTurn: {
              turnIndex,
              beforeByPath: new Map(),
              touchedPaths: new Set(),
            },
          },
        },
      };
    });
  },

  noteFileMutation: (tabId, relativePath, absolutePath, beforeContent) => {
    if (!relativePath) return;
    set((s) => {
      const tab = s.byTab[tabId];
      if (!tab?.pendingTurn) return s;
      const pending = tab.pendingTurn;
      pending.touchedPaths.add(relativePath);
      if (!pending.beforeByPath.has(relativePath)) {
        pending.beforeByPath.set(relativePath, beforeContent);
      }
      return {
        byTab: {
          ...s.byTab,
          [tabId]: { ...tab, pendingTurn: { ...pending } },
        },
      };
    });
    void absolutePath; // used at finalize via path resolution
  },

  finalizeTurn: async (tabId, success) => {
    const tab = get().byTab[tabId];
    if (!tab?.pendingTurn || !success) {
      set((s) => {
        const t = s.byTab[tabId];
        if (!t) return s;
        return {
          byTab: {
            ...s.byTab,
            [tabId]: { ...t, pendingTurn: null },
          },
        };
      });
      return;
    }

    const { turnIndex, touchedPaths } = tab.pendingTurn;
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (!projectRoot || !tab.sessionId) {
      set((s) => ({
        byTab: {
          ...s.byTab,
          [tabId]: { ...tab, pendingTurn: null },
        },
      }));
      return;
    }

    const prevFiles = snapshotFromCheckpoints(tab.checkpoints);
    const fileMap = new Map<string, CheckpointFile>();
    for (const f of prevFiles) {
      fileMap.set(f.relativePath, f);
    }

    for (const relPath of touchedPaths) {
      const docFile = useDocumentStore.getState().files.find((f) => f.relativePath === relPath);
      const absolutePath = docFile?.absolutePath ?? `${projectRoot}/${relPath}`;
      const content = await readFileSnapshot(relPath, absolutePath);
      fileMap.set(relPath, { relativePath: relPath, absolutePath, content });
    }

    const checkpoint: TurnCheckpoint = {
      turnIndex,
      createdAt: Date.now(),
      files: [...fileMap.values()],
      touchedThisTurn: [...touchedPaths],
    };

    const checkpoints = [...tab.checkpoints.filter((c) => c.turnIndex !== turnIndex), checkpoint]
      .sort((a, b) => a.turnIndex - b.turnIndex);

    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: {
          ...tab,
          checkpoints,
          pendingTurn: null,
          restoreUndo: null,
        },
      },
    }));

    await persistCheckpoints(projectRoot, tab.sessionId, checkpoints);
    log.info(`Checkpoint saved: turn=${turnIndex} files=${checkpoint.files.length} touched=${touchedPaths.size}`);
  },

  getCheckpoint: (tabId, turnIndex) => {
    return get().byTab[tabId]?.checkpoints.find((c) => c.turnIndex === turnIndex) ?? null;
  },

  getLatestCheckpoint: (tabId) => {
    const cps = get().byTab[tabId]?.checkpoints ?? [];
    if (cps.length === 0) return null;
    return cps[cps.length - 1];
  },

  canRestoreToTurn: (tabId, turnIndex) => {
    const cp = get().getCheckpoint(tabId, turnIndex);
    return Boolean(cp && cp.touchedThisTurn.length > 0);
  },

  canUndoRestore: (tabId) => Boolean(get().byTab[tabId]?.restoreUndo),

  restoreToTurn: async (tabId, turnIndex) => {
    const tab = get().byTab[tabId];
    const target = tab?.checkpoints.find((c) => c.turnIndex === turnIndex);
    if (!tab || !target) return 0;

    const { projectRoot, worktreePath } = sessionPaths();
    if (!projectRoot) return 0;

    const chatTab = useChatStore.getState().tabs.find((t) => t.id === tabId);
    const messagesBefore = chatTab ? [...chatTab.messages] : [];

    const currentSnapshot: RestoreUndoState = {
      files: await Promise.all(
        snapshotFromCheckpoints(tab.checkpoints).map(async (f) => ({
          ...f,
          content: await readFileSnapshot(f.relativePath, f.absolutePath),
        })),
      ),
      checkpoints: [...tab.checkpoints],
      messages: messagesBefore,
    };

    const sessionId = tab.sessionId ?? chatTab?.sessionId ?? null;
    if (sessionId) {
      await window.electronAPI.sessionTruncateToTurn({
        sessionId,
        projectPath: projectRoot,
        worktreePath,
        turnIndex,
      });
      useChatStore.getState().truncateToTurn(tabId, turnIndex);
    } else {
      useChatStore.getState().truncateToTurn(tabId, turnIndex);
    }

    await applyCheckpointFiles(target.files);
    useChangesStore.getState().clearAll();

    const kept = tab.checkpoints.filter((c) => c.turnIndex <= turnIndex);
    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: {
          ...tab,
          checkpoints: kept,
          restoreUndo: currentSnapshot,
        },
      },
    }));

    if (sessionId) {
      await persistCheckpoints(projectRoot, sessionId, kept);
    }

    return target.files.length;
  },

  restorePreviousTurn: async (tabId) => {
    const latest = get().getLatestCheckpoint(tabId);
    if (!latest || latest.turnIndex <= 0) {
      const tab = get().byTab[tabId];
      if (!tab || tab.checkpoints.length === 0) return null;
      return get().restoreToTurn(tabId, 0);
    }
    return get().restoreToTurn(tabId, latest.turnIndex - 1);
  },

  undoLastRestore: async (tabId) => {
    const tab = get().byTab[tabId];
    const undo = tab?.restoreUndo;
    if (!tab || !undo) return false;

    const { projectRoot, worktreePath } = sessionPaths();
    const sessionId = tab.sessionId
      ?? useChatStore.getState().tabs.find((t) => t.id === tabId)?.sessionId
      ?? null;

    if (sessionId && projectRoot) {
      await window.electronAPI.sessionUndoTruncate({
        sessionId,
        projectPath: projectRoot,
        worktreePath,
      });
    }

    if (undo.messages.length > 0) {
      useChatStore.getState().restoreMessages(tabId, undo.messages);
    }

    await applyCheckpointFiles(undo.files);
    useChangesStore.getState().clearAll();

    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: {
          ...tab,
          checkpoints: undo.checkpoints,
          restoreUndo: null,
        },
      },
    }));

    if (projectRoot && sessionId) {
      await persistCheckpoints(projectRoot, sessionId, undo.checkpoints);
    }

    return true;
  },
}));

/** Resolve project-relative path from an absolute or relative tool path. */
export function resolveRelativeToolPath(filePath: string): {
  relativePath: string;
  absolutePath: string;
} | null {
  if (!filePath?.trim()) return null;
  const docState = useDocumentStore.getState();
  const projectRoot = docState.projectRoot;
  if (!projectRoot) return null;

  const activeWorktree = useWorktreeStore.getState().activeWorktree;

  let relativePath = filePath;
  if (activeWorktree && filePath.startsWith(activeWorktree.path)) {
    relativePath = filePath.slice(activeWorktree.path.length).replace(/^\//, "");
  } else if (filePath.startsWith(projectRoot)) {
    relativePath = filePath.slice(projectRoot.length).replace(/^\//, "");
  }

  const file = docState.files.find(
    (f) => f.relativePath === relativePath || f.absolutePath === filePath,
  );
  const absolutePath = file?.absolutePath
    ?? (activeWorktree && filePath.startsWith(activeWorktree.path)
      ? filePath
      : filePath.startsWith(projectRoot)
        ? filePath
        : `${projectRoot}/${relativePath}`);

  return { relativePath, absolutePath };
}

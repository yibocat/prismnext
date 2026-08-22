import { create } from "zustand";
import { useDocumentStore } from "./document-store";
import { resolveWorktreePathForSend, resolveWorktreeAtCheckout } from "@/lib/git/checkout-context";
import { useChatStore, type ChatStreamMessage } from "./chat-store";
import { useChangesStore } from "./changes-store";
import {
  countConversationTurns,
  conversationHasCommittedTurn,
  snapshotConversation,
} from "@/lib/chat/conversation-view";
import type { Conversation } from "../../shared/agent/conversation";
import { createLogger } from "@/services/logger";
import { projectCheckpointsRel } from "@shared/workbench/paths";

const log = createLogger("checkpoint-store", "agent");

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
  /** Paths created this turn (did not exist before first mutation) — deleted on rollback to earlier turns */
  createdThisTurn?: string[];
}

interface PendingTurn {
  turnIndex: number;
  /** Content before the first mutation in this turn */
  beforeByPath: Map<string, string>;
  touchedPaths: Set<string>;
  createdPaths: Set<string>;
}

/** Snapshot taken before a rollback — used by 「后悔」/ undo-last-rollback. */
export interface RegretState {
  files: CheckpointFile[];
  checkpoints: TurnCheckpoint[];
  /** @deprecated OpenCode stream snapshot. Formal undo restores `conversation`. */
  messages: ChatStreamMessage[];
  conversation?: Conversation;
  /**
   * Edit-resend: keep regret across the immediate rebound turn's finalize.
   * Cleared after that finalize (or on dismiss / another rollback).
   */
  surviveNextFinalize?: boolean;
}

export interface RollbackOptions {
  /** Edit-resend path: regret remains after the next successful finalizeTurn. */
  preserveRegretAcrossNextFinalize?: boolean;
}

interface TabCheckpointState {
  sessionId: string | null;
  checkpoints: TurnCheckpoint[];
  pendingTurn: PendingTurn | null;
  /** Single-step regret: tip before the last rollback */
  regret: RegretState | null;
  /** Checkout root when checkpoints were captured (worktree path or project root). */
  boundCheckoutPath: string | null;
}

interface CheckpointStoreState {
  byTab: Record<string, TabCheckpointState>;

  initSession: (tabId: string, sessionId: string) => Promise<void>;
  setSessionId: (tabId: string, sessionId: string) => void;
  clearTab: (tabId: string) => void;
  /** Remove all restore snapshots for a tab (worktree merge/close). */
  clearTabCheckpoints: (tabId: string) => Promise<void>;
  /** Delete on-disk checkpoint files that reference a closed/merged worktree. */
  clearOrphanCheckpointsOnDiskForWorktree: (worktreePath: string) => Promise<void>;
  clearAll: () => void;
  beginTurn: (tabId: string, turnIndex: number) => void;
  noteFileMutation: (
    tabId: string,
    relativePath: string,
    absolutePath: string,
    beforeContent: string,
    opts?: { created?: boolean },
  ) => void;
  /**
   * After Accept (or late disk write) when the turn already finalized:
   * upsert file into the latest checkpoint so rollback still covers it.
   */
  sealFileIntoLatestCheckpoint: (
    tabId: string,
    file: CheckpointFile,
    opts?: { created?: boolean },
  ) => Promise<void>;
  finalizeTurn: (tabId: string, success: boolean) => Promise<void>;
  getCheckpoint: (tabId: string, turnIndex: number) => TurnCheckpoint | null;
  getLatestCheckpoint: (tabId: string) => TurnCheckpoint | null;
  /** Roll world (chat + files + Proposed Changes) back to end of turnIndex (-1 = empty). */
  rollbackToTurn: (
    tabId: string,
    turnIndex: number,
    opts?: RollbackOptions,
  ) => Promise<number>;
  rollbackPreviousTurn: (tabId: string) => Promise<number | null>;
  /**
   * Undo last rollback. Restores in-memory tip even if OpenCode session
   * undo fails (e.g. app restarted and truncation backup is gone).
   */
  undoLastRollback: (tabId: string) => Promise<{
    ok: boolean;
    sessionRestored: boolean;
  }>;
  canRollbackToTurn: (tabId: string, turnIndex: number) => boolean;
  canUndoRollback: (tabId: string) => boolean;
  /** @deprecated Use rollbackToTurn */
  restoreToTurn: (
    tabId: string,
    turnIndex: number,
    opts?: RollbackOptions,
  ) => Promise<number>;
  /** @deprecated Use rollbackPreviousTurn */
  restorePreviousTurn: (tabId: string) => Promise<number | null>;
  /** @deprecated Use undoLastRollback */
  undoLastRestore: (tabId: string) => Promise<boolean>;
  /** @deprecated Use canRollbackToTurn */
  canRestoreToTurn: (tabId: string, turnIndex: number) => boolean;
  /** @deprecated Use canUndoRollback */
  canUndoRestore: (tabId: string) => boolean;
}

function emptyTabState(): TabCheckpointState {
  return {
    sessionId: null,
    checkpoints: [],
    pendingTurn: null,
    regret: null,
    boundCheckoutPath: null,
  };
}

function normalizeCheckoutPath(path: string): string {
  return path.replace(/\/+$/, "");
}

function worktreePathPrefix(worktreePath: string): string {
  return `${normalizeCheckoutPath(worktreePath)}/`;
}

function checkpointReferencesWorktree(
  checkpoints: TurnCheckpoint[],
  worktreePath: string,
): boolean {
  const wt = normalizeCheckoutPath(worktreePath);
  const prefix = worktreePathPrefix(wt);
  for (const cp of checkpoints) {
    for (const f of cp.files) {
      const abs = normalizeCheckoutPath(f.absolutePath);
      if (abs === wt || abs.startsWith(prefix)) return true;
    }
  }
  return false;
}

async function listCheckpointSessionIds(projectRoot: string): Promise<string[]> {
  const dir = `${projectRoot}/${projectCheckpointsRel()}`;
  try {
    const exists = await window.electronAPI.fsExists(dir);
    if (!exists) return [];
    const { files } = await window.electronAPI.fsScan(dir);
    return files
      .filter((f) => f.relativePath.endsWith(".json"))
      .map((f) => f.relativePath.replace(/\.json$/, "").split("/").pop() || "");
  } catch {
    return [];
  }
}

function checkpointPath(projectRoot: string, sessionId: string): string {
  return `${projectRoot}/${projectCheckpointsRel()}/${sessionId}.json`;
}

async function readFileSnapshot(
  relativePath: string,
  absolutePath: string,
): Promise<string> {
  const docState = useDocumentStore.getState();
  const file = docState.files.find((f) => f.relativePath === relativePath);
  if (file) {
    await docState.refreshFileContent(file.id);
    const content = docState.getAsset(file.id);
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

/** Delete workspace files that were created after the rollback target. */
async function deleteCheckpointOrphans(
  projectRoot: string,
  absoluteByRel: Map<string, string>,
  relativePaths: Iterable<string>,
): Promise<void> {
  const docState = useDocumentStore.getState();
  for (const rel of relativePaths) {
    const absolutePath =
      absoluteByRel.get(rel)
      ?? docState.files.find((f) => f.relativePath === rel)?.absolutePath
      ?? `${projectRoot}/${rel}`;
    try {
      const exists = await window.electronAPI.fsExists(absolutePath);
      if (!exists) continue;
      await window.electronAPI.fsDelete(absolutePath);
      log.info(`Rollback deleted created file: ${rel}`);
    } catch (err) {
      log.warn(`Failed to delete orphan ${rel}`, { error: (err as Error).message });
    }
  }
  await docState.refreshFiles();
}

function collectCreatedAfterTurn(
  checkpoints: TurnCheckpoint[],
  turnIndex: number,
): { paths: string[]; absoluteByRel: Map<string, string> } {
  const targetPaths = new Set<string>();
  const absoluteByRel = new Map<string, string>();
  for (const cp of checkpoints) {
    for (const f of cp.files) {
      absoluteByRel.set(f.relativePath, f.absolutePath);
      if (cp.turnIndex <= turnIndex) targetPaths.add(f.relativePath);
    }
  }
  const paths = new Set<string>();
  for (const cp of checkpoints) {
    if (cp.turnIndex <= turnIndex) continue;
    for (const rel of cp.createdThisTurn ?? []) {
      if (!targetPaths.has(rel)) paths.add(rel);
    }
  }
  return { paths: [...paths], absoluteByRel };
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

async function deleteCheckpointsOnDisk(projectRoot: string, sessionId: string): Promise<void> {
  const path = checkpointPath(projectRoot, sessionId);
  try {
    const exists = await window.electronAPI.fsExists(path);
    if (exists) await window.electronAPI.fsDelete(path);
  } catch {
    // Best-effort
  }
}

function currentBoundCheckoutPath(tabId?: string): string | null {
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot) return null;
  const chat = useChatStore.getState();
  const tab = tabId
    ? chat.tabs.find((t) => t.id === tabId)
    : chat.tabs.find((t) => t.id === chat.activeTabId);
  return tab?.sessionCwd ?? projectRoot;
}

function checkpointsMatchCheckout(
  checkpoints: TurnCheckpoint[],
  boundPath: string | null,
): boolean {
  if (!boundPath || checkpoints.length === 0) return true;
  const prefix = boundPath.endsWith("/") ? boundPath : `${boundPath}/`;
  for (const cp of checkpoints) {
    for (const f of cp.files) {
      if (f.absolutePath === boundPath || f.absolutePath.startsWith(prefix)) {
        return true;
      }
    }
  }
  // Legacy checkpoints without matching paths — require current cwd match
  return boundPath === useDocumentStore.getState().checkoutRoot;
}

function sessionPaths(tabId?: string) {
  const projectRoot = useDocumentStore.getState().projectRoot || "";
  const chat = useChatStore.getState();
  const tab = tabId
    ? chat.tabs.find((t) => t.id === tabId)
    : chat.tabs.find((t) => t.id === chat.activeTabId);
  const worktreePath = resolveWorktreePathForSend(tab, projectRoot || null);
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
          regret: existing?.regret ?? null,
          boundCheckoutPath:
            existing?.boundCheckoutPath
            ?? currentBoundCheckoutPath(tabId),
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

  clearTabCheckpoints: async (tabId) => {
    const tab = get().byTab[tabId];
    const chatTab = useChatStore.getState().tabs.find((t) => t.id === tabId);
    const sessionId = tab?.sessionId ?? chatTab?.sessionId ?? null;
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (projectRoot && sessionId) {
      await deleteCheckpointsOnDisk(projectRoot, sessionId);
    }
    set((s) => {
      const existing = s.byTab[tabId] ?? emptyTabState();
      return {
        byTab: {
          ...s.byTab,
          [tabId]: {
            ...existing,
            sessionId: sessionId ?? existing.sessionId,
            checkpoints: [],
            pendingTurn: null,
            regret: null,
            boundCheckoutPath: currentBoundCheckoutPath(tabId),
          },
        },
      };
    });
  },

  clearOrphanCheckpointsOnDiskForWorktree: async (worktreePath) => {
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (!projectRoot) return;

    for (const sessionId of await listCheckpointSessionIds(projectRoot)) {
      const checkpoints = await loadCheckpointsFromDisk(projectRoot, sessionId);
      if (!checkpointReferencesWorktree(checkpoints, worktreePath)) continue;
      await deleteCheckpointsOnDisk(projectRoot, sessionId);
    }
  },

  clearAll: () => set({ byTab: {} }),

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
              createdPaths: new Set(),
            },
          },
        },
      };
    });
  },

  noteFileMutation: (tabId, relativePath, absolutePath, beforeContent, opts) => {
    if (!relativePath) return;
    set((s) => {
      const tab = s.byTab[tabId];
      if (!tab?.pendingTurn) return s;
      const pending = tab.pendingTurn;
      pending.touchedPaths.add(relativePath);
      if (!pending.beforeByPath.has(relativePath)) {
        pending.beforeByPath.set(relativePath, beforeContent);
      }
      const created =
        opts?.created === true
        || (opts?.created !== false
          && beforeContent === ""
          && !useDocumentStore.getState().files.some((f) => f.relativePath === relativePath));
      if (created) pending.createdPaths.add(relativePath);
      return {
        byTab: {
          ...s.byTab,
          [tabId]: { ...tab, pendingTurn: { ...pending } },
        },
      };
    });
    void absolutePath; // used at finalize via path resolution
  },

  sealFileIntoLatestCheckpoint: async (tabId, file, opts) => {
    const tab = get().byTab[tabId];
    if (!tab) return;

    if (tab.pendingTurn) {
      get().noteFileMutation(
        tabId,
        file.relativePath,
        file.absolutePath,
        // Prefer empty before only when marked created; otherwise keep prior.
        opts?.created ? "" : (tab.pendingTurn.beforeByPath.get(file.relativePath) ?? ""),
        opts,
      );
      return;
    }

    const projectRoot = useDocumentStore.getState().projectRoot;
    if (!projectRoot || !tab.sessionId) return;

    const chatTab = useChatStore.getState().tabs.find((t) => t.id === tabId);
    const turnIndex = chatTab?.conversation.live?.turnIndex
      ?? Math.max(0, countConversationTurns(chatTab?.conversation) - 1);

    let checkpoints = [...tab.checkpoints];
    let latest = checkpoints.find((c) => c.turnIndex === turnIndex)
      ?? checkpoints[checkpoints.length - 1]
      ?? null;

    if (!latest) {
      latest = {
        turnIndex,
        createdAt: Date.now(),
        files: [file],
        touchedThisTurn: [file.relativePath],
        createdThisTurn: opts?.created ? [file.relativePath] : [],
      };
      checkpoints = [latest];
    } else {
      const files = [
        ...latest.files.filter((f) => f.relativePath !== file.relativePath),
        file,
      ];
      const touched = latest.touchedThisTurn.includes(file.relativePath)
        ? latest.touchedThisTurn
        : [...latest.touchedThisTurn, file.relativePath];
      const created = new Set(latest.createdThisTurn ?? []);
      if (opts?.created) created.add(file.relativePath);
      latest = {
        ...latest,
        files,
        touchedThisTurn: touched,
        createdThisTurn: [...created],
      };
      checkpoints = [
        ...checkpoints.filter((c) => c.turnIndex !== latest!.turnIndex),
        latest,
      ].sort((a, b) => a.turnIndex - b.turnIndex);
    }

    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: { ...tab, checkpoints },
      },
    }));
    await persistCheckpoints(projectRoot, tab.sessionId, checkpoints);
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

    const { turnIndex, touchedPaths, createdPaths } = tab.pendingTurn;
    const createdList = [...(createdPaths ?? new Set<string>())];
    const projectRoot = useDocumentStore.getState().projectRoot;

    const advanceRegret = (current: typeof tab) => {
      const prevRegret = current.regret;
      if (prevRegret?.surviveNextFinalize) {
        return { ...prevRegret, surviveNextFinalize: false };
      }
      return null;
    };

    if (!projectRoot || !tab.sessionId) {
      set((s) => {
        const t = s.byTab[tabId];
        if (!t) return s;
        return {
          byTab: {
            ...s.byTab,
            [tabId]: { ...t, pendingTurn: null, regret: advanceRegret(t) },
          },
        };
      });
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
      createdThisTurn: createdList,
    };

    const checkpoints = [...tab.checkpoints.filter((c) => c.turnIndex !== turnIndex), checkpoint]
      .sort((a, b) => a.turnIndex - b.turnIndex);

    const nextRegret = advanceRegret(tab);

    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: {
          ...tab,
          checkpoints,
          pendingTurn: null,
          regret: nextRegret,
          boundCheckoutPath: tab.boundCheckoutPath ?? currentBoundCheckoutPath(tabId),
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

  canRollbackToTurn: (tabId, turnIndex) => {
    const tab = get().byTab[tabId];
    const chatTab = useChatStore.getState().tabs.find((t) => t.id === tabId);
    if (!conversationHasCommittedTurn(chatTab?.conversation, turnIndex)) return false;

    const bound = tab?.boundCheckoutPath ?? currentBoundCheckoutPath(tabId);
    const cwd = currentBoundCheckoutPath(tabId);
    if (bound && cwd && bound !== cwd) return false;
    if (tab?.checkpoints.length && !checkpointsMatchCheckout(tab.checkpoints, bound)) {
      return false;
    }

    // Every completed turn is a rollback endpoint (files optional).
    return true;
  },

  canUndoRollback: (tabId) => Boolean(get().byTab[tabId]?.regret),

  rollbackToTurn: async (tabId, turnIndex, opts) => {
    const tab = get().byTab[tabId] ?? emptyTabState();
    const chatTab = useChatStore.getState().tabs.find((t) => t.id === tabId);
    const messagesBefore = chatTab ? [...chatTab.messages] : [];
    const conversationBefore = chatTab?.conversation
      ? snapshotConversation(chatTab.conversation)
      : undefined;

    const { projectRoot } = sessionPaths(tabId);
    if (!projectRoot) return 0;

    const fileTarget =
      turnIndex < 0
        ? null
        : tab.checkpoints.find((c) => c.turnIndex === turnIndex)
          ?? [...tab.checkpoints].reverse().find((c) => c.turnIndex <= turnIndex)
          ?? null;

    const regretSnapshot: RegretState = {
      files: await Promise.all(
        snapshotFromCheckpoints(tab.checkpoints).map(async (f) => ({
          ...f,
          content: await readFileSnapshot(f.relativePath, f.absolutePath),
        })),
      ),
      checkpoints: [...tab.checkpoints],
      messages: messagesBefore,
      ...(conversationBefore ? { conversation: conversationBefore } : {}),
      surviveNextFinalize: opts?.preserveRegretAcrossNextFinalize === true,
    };

    const conversationId = chatTab?.conversation?.conversationId
      || tab.sessionId
      || chatTab?.sessionId
      || null;
    if (conversationId) {
      const truncated = await window.electronAPI.agentTruncateToTurn({
        conversationId,
        turnIndex,
      });
      if (!truncated.ok) {
        useChatStore.getState().truncateToTurn(tabId, turnIndex);
      } else {
        await useChatStore.getState().resyncTabMessagesFromDisk(tabId);
      }
    } else {
      useChatStore.getState().truncateToTurn(tabId, turnIndex);
    }

    const { paths: orphanPaths, absoluteByRel } = turnIndex < 0
      ? (() => {
          const absoluteByRel = new Map<string, string>();
          const paths = new Set<string>();
          for (const cp of tab.checkpoints) {
            for (const f of cp.files) {
              absoluteByRel.set(f.relativePath, f.absolutePath);
              paths.add(f.relativePath);
            }
            for (const rel of cp.touchedThisTurn) paths.add(rel);
            for (const rel of cp.createdThisTurn ?? []) paths.add(rel);
          }
          return { paths: [...paths], absoluteByRel };
        })()
      : collectCreatedAfterTurn(tab.checkpoints, turnIndex);
    if (orphanPaths.length > 0) {
      await deleteCheckpointOrphans(projectRoot, absoluteByRel, orphanPaths);
    }

    if (fileTarget?.files.length) {
      await applyCheckpointFiles(fileTarget.files);
    }
    useChangesStore.getState().clearAll();

    const kept = turnIndex < 0
      ? []
      : tab.checkpoints.filter((c) => c.turnIndex <= turnIndex);
    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: {
          ...tab,
          sessionId: conversationId ?? tab.sessionId,
          checkpoints: kept,
          pendingTurn: null,
          regret: regretSnapshot,
        },
      },
    }));

    if (conversationId) {
      await persistCheckpoints(projectRoot, conversationId, kept);
    }

    return fileTarget?.files.length ?? 0;
  },

  rollbackPreviousTurn: async (tabId) => {
    const chatTab = useChatStore.getState().tabs.find((t) => t.id === tabId);
    const turnCount = countConversationTurns(chatTab?.conversation);
    if (turnCount <= 0) return null;

    const latest = get().getLatestCheckpoint(tabId);
    if (!latest || latest.turnIndex <= 0) {
      if (turnCount <= 1) {
        // Only one turn — roll back to empty world.
        return get().rollbackToTurn(tabId, -1);
      }
      return get().rollbackToTurn(tabId, 0);
    }
    return get().rollbackToTurn(tabId, latest.turnIndex - 1);
  },

  undoLastRollback: async (tabId) => {
    const tab = get().byTab[tabId];
    const undo = tab?.regret;
    if (!tab || !undo) return { ok: false, sessionRestored: false };

    const { projectRoot } = sessionPaths(tabId);
    const chatTab = useChatStore.getState().tabs.find((t) => t.id === tabId);
    const conversationId = chatTab?.conversation?.conversationId
      || tab.sessionId
      || chatTab?.sessionId
      || null;
    const sessionId = conversationId;

    let sessionRestored = false;
    if (conversationId) {
      try {
        const undone = await window.electronAPI.agentUndoTruncate({ conversationId });
        sessionRestored = undone.ok;
        if (undone.ok) {
          await useChatStore.getState().resyncTabMessagesFromDisk(tabId);
        }
      } catch (err) {
        log.warn("agentUndoTruncate failed — restoring UI/files from in-memory regret", {
          error: (err as Error).message,
        });
      }
    }

    if (!sessionRestored) {
      if (undo.conversation) {
        useChatStore.getState().restoreConversation(tabId, undo.conversation);
      } else {
        useChatStore.getState().restoreMessages(tabId, undo.messages);
      }
    }

    await applyCheckpointFiles(undo.files);
    useChangesStore.getState().clearAll();

    set((s) => ({
      byTab: {
        ...s.byTab,
        [tabId]: {
          ...tab,
          checkpoints: undo.checkpoints,
          regret: null,
        },
      },
    }));

    if (projectRoot && sessionId) {
      await persistCheckpoints(projectRoot, sessionId, undo.checkpoints);
    }

    return { ok: true, sessionRestored };
  },

  // Deprecated aliases — keep call sites working during migration.
  restoreToTurn: (tabId, turnIndex, opts) => get().rollbackToTurn(tabId, turnIndex, opts),
  restorePreviousTurn: (tabId) => get().rollbackPreviousTurn(tabId),
  undoLastRestore: async (tabId) => {
    const result = await get().undoLastRollback(tabId);
    return result.ok;
  },
  canRestoreToTurn: (tabId, turnIndex) => get().canRollbackToTurn(tabId, turnIndex),
  canUndoRestore: (tabId) => get().canUndoRollback(tabId),
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

  const activeWorktree = resolveWorktreeAtCheckout();

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

import { useEffect } from "react";
import { create } from "zustand";
import type {
  PaperExtractSource,
  PaperExtractState,
  PaperExtractStatesByPaper,
  PaperExtractProgress,
} from "@/types/electron.d";
import { pickBestReadySource } from "../../shared/literature/paper-extract";
import { useLiteratureStore } from "@/stores/literature-store";

const EXTRACT_SOURCES: PaperExtractSource[] = ["mineru", "pdfjs", "html"];

function progressStoreKey(paperId: string, source: PaperExtractSource): string {
  return `${paperId}::${source}`;
}

/** Zustand selector — reads `progressByKey` so progress ticks re-render subscribers. */
export function selectExtractProgressForPaper(
  progressByKey: Record<string, PaperExtractProgress>,
  paperId: string,
): PaperExtractProgress | null {
  const prefix = `${paperId}::`;
  for (const [key, progress] of Object.entries(progressByKey)) {
    if (key.startsWith(prefix)) return progress;
  }
  return null;
}

interface LiteratureExtractStore {
  statesByPaper: PaperExtractStatesByPaper;
  progressByKey: Record<string, PaperExtractProgress>;
  loadStatesForPapers: (projectRoot: string, paperIds: string[]) => Promise<void>;
  enqueue: (
    projectRoot: string,
    paperId: string,
    source: PaperExtractSource,
    force?: boolean,
  ) => Promise<void>;
  cancel: (projectRoot: string, paperId: string, source: PaperExtractSource) => Promise<void>;
  retry: (projectRoot: string, paperId: string, source: PaperExtractSource) => Promise<void>;
  enqueueBatch: (
    projectRoot: string,
    paperIds: string[],
    source: PaperExtractSource,
    force?: boolean,
  ) => Promise<{ enqueued: number; skipped: number; capped: boolean }>;
  enqueueCollection: (
    projectRoot: string,
    collectionId: string,
    source: PaperExtractSource,
    force?: boolean,
  ) => Promise<{ enqueued: number; skipped: number; capped: boolean }>;
  applyState: (state: PaperExtractState) => void;
  applyProgress: (progress: PaperExtractProgress) => void;
  clearProgress: (paperId: string, source: PaperExtractSource) => void;
  progressForPaper: (paperId: string) => PaperExtractProgress | null;
  bestReadySource: (paperId: string) => PaperExtractSource | null;
}

export const useLiteratureExtractStore = create<LiteratureExtractStore>((set, get) => ({
  statesByPaper: {},
  progressByKey: {},

  applyProgress: (progress) => {
    // Drop progress for papers already in a terminal state — avoids stale
    // "MinerU processing…" text after the job finished.
    const states = get().statesByPaper[progress.paperId];
    const terminal = states
      ? EXTRACT_SOURCES.some((s) => {
          const st = states[s];
          return st?.source === progress.source &&
            (st.status === "ready" || st.status === "failed" || st.status === "idle");
        })
      : false;
    if (terminal) return;
    const key = progressStoreKey(progress.paperId, progress.source);
    set((s) => ({
      progressByKey: { ...s.progressByKey, [key]: progress },
    }));
  },

  clearProgress: (paperId, source) => {
    const key = progressStoreKey(paperId, source);
    set((s) => {
      if (!s.progressByKey[key]) return s;
      const next = { ...s.progressByKey };
      delete next[key];
      return { progressByKey: next };
    });
  },

  progressForPaper: (paperId) =>
    selectExtractProgressForPaper(get().progressByKey, paperId),

  applyState: (state) => {
    if (state.status === "ready" || state.status === "failed" || state.status === "idle") {
      get().clearProgress(state.paperId, state.source);
    }
    set((s) => ({
      statesByPaper: {
        ...s.statesByPaper,
        [state.paperId]: {
          ...s.statesByPaper[state.paperId],
          [state.source]: state,
        },
      },
    }));
  },

  loadStatesForPapers: async (projectRoot, paperIds) => {
    if (!paperIds.length) return;
    const batch = await window.electronAPI.extractList(projectRoot, paperIds);
    set((s) => ({
      statesByPaper: { ...s.statesByPaper, ...batch },
    }));
  },

  enqueue: async (projectRoot, paperId, source, force) => {
    await window.electronAPI.extractEnqueue(projectRoot, paperId, source, force);
  },

  cancel: async (projectRoot, paperId, source) => {
    await window.electronAPI.extractCancel(projectRoot, paperId, source);
  },

  retry: async (projectRoot, paperId, source) => {
    await window.electronAPI.extractRetry(projectRoot, paperId, source);
  },

  enqueueBatch: async (projectRoot, paperIds, source, force) => {
    return window.electronAPI.extractEnqueueBatch(projectRoot, paperIds, source, force);
  },

  enqueueCollection: async (projectRoot, collectionId, source, force) => {
    return window.electronAPI.extractEnqueueCollection(projectRoot, collectionId, source, force);
  },

  bestReadySource: (paperId) => pickBestReadySource(get().statesByPaper[paperId], "auto"),
}));

let extractListenerRefCount = 0;
let extractListenerCleanup: (() => void) | null = null;

export function bindLiteratureExtractIpc(projectRoot: string | null): () => void {
  extractListenerRefCount += 1;

  if (!extractListenerCleanup) {
    const offStatus = window.electronAPI.onExtractStatusChanged(({ projectRoot: root, state }) => {
      if (projectRoot && root !== projectRoot) return;
      useLiteratureExtractStore.getState().applyState(state);
      if (state.status === "ready") {
        void useLiteratureStore.getState().refresh(root);
      }
    });

    const offProgress = window.electronAPI.onExtractProgress(({ projectRoot: root, progress }) => {
      if (projectRoot && root !== projectRoot) return;
      useLiteratureExtractStore.getState().applyProgress(progress);
    });

    const offProgressClear = window.electronAPI.onExtractProgressClear(
      ({ projectRoot: root, paperId, source }) => {
        if (projectRoot && root !== projectRoot) return;
        useLiteratureExtractStore.getState().clearProgress(paperId, source);
      },
    );

    const offPdfCached = window.electronAPI.onExtractPdfCached(({ projectRoot: root, paperId }) => {
      if (projectRoot && root !== projectRoot) return;
      useLiteratureStore.getState().markPaperPdfCached(paperId);
      void useLiteratureStore.getState().refresh(root);
    });

    const offMaterialized = window.electronAPI.onLiteraturePaperMaterialized(
      ({ projectRoot: root }) => {
        if (projectRoot && root !== projectRoot) return;
        void useLiteratureStore.getState().refresh(root);
      },
    );

    const offAgent = window.electronAPI.onExtractAgentRequested((payload) => {
      if (projectRoot && payload.projectRoot !== projectRoot) return;
      void import("sonner").then(({ toast }) => {
        toast.info(`Agent started PDF extraction for "${payload.title}" (${payload.source})`, {
          description: "MinerU mode uploads PDF to cloud. Track progress in Literature.",
          duration: 8000,
        });
      });
    });

    const offAiMetadata = window.electronAPI.onLiteratureAiMetadataChanged(({ projectRoot: root }) => {
      if (projectRoot && root !== projectRoot) return;
      void useLiteratureStore.getState().refresh(root);
    });

    extractListenerCleanup = () => {
      offStatus();
      offProgress();
      offProgressClear();
      offPdfCached();
      offMaterialized();
      offAgent();
      offAiMetadata();
    };
  }

  return () => {
    extractListenerRefCount = Math.max(0, extractListenerRefCount - 1);
    if (extractListenerRefCount === 0 && extractListenerCleanup) {
      extractListenerCleanup();
      extractListenerCleanup = null;
    }
  };
}

/** IPC + extract state sync for any active Literature tab (library or paper reader). */
export function useLiteratureExtractSession(
  projectRoot: string | null,
  paperIds: string[],
): void {
  const loadExtractStates = useLiteratureExtractStore((s) => s.loadStatesForPapers);
  const paperIdsKey = paperIds.join("\0");

  useEffect(() => {
    if (!projectRoot) return;
    const unbind = bindLiteratureExtractIpc(projectRoot);
    void window.electronAPI.extractResume(projectRoot);
    return unbind;
  }, [projectRoot]);

  useEffect(() => {
    if (!projectRoot || paperIds.length === 0) return;
    void loadExtractStates(projectRoot, paperIds);
  }, [projectRoot, paperIdsKey, loadExtractStates, paperIds]);
}

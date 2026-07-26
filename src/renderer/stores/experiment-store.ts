/**
 * experiment-store — Zustand store for the Experiments RightArea mode
 * (Sprint 0.7).
 *
 * Mirrors the literature-store conventions: no `persist` middleware
 * (UI prefs route through workspace-config when needed), actions take
 * `projectRoot` as the first argument, IPC mutations are followed by a
 * state reload, and the `experiment:runComplete` event is wired once at
 * module load.
 *
 * The actual user-facing action wiring (file tree reveal, terminal cwd,
 * permission modal) lives in the mode UI (Tasks 5–7) — this store only
 * owns the data and IPC plumbing.
 */

import { create } from "zustand";
import type {
  ExperimentEnv,
  ExperimentMeta,
  ExperimentRunCompleteEvent,
  ExperimentRunEntry,
  ExperimentRunKind,
  ExperimentRunResult,
  ExperimentSummary,
} from "../../shared/experiment-log";
import { RUN_OUTPUT_TAIL_BYTES, stripAnsi, tailBytes } from "../../shared/experiment-log";
import { useLayoutStore } from "@/stores/layout-store";
import { useChatStore } from "@/stores/chat-store";
import { navigateFileTreeToPath } from "@/lib/files/navigate-file-tree";
import { useRightPanelStore } from "@/stores/right-panel-store";
// Side-effect: subscribe to experiment:changed (auto-refresh + Agent open).
import "@/modes/experiments-mode/open-experiment";

/**
 * Max runs loaded per experiment detail. The service default is 20 (tail-newest);
 * we raise it here so the paginated runs history (PAGE_SIZE = 10 in the table)
 * can show more than 2 pages instead of silently hiding older runs.
 */
const RUNS_LOAD_LIMIT = 200;

/** @deprecated Use `ExperimentRunResult` from `shared/experiment-log`. */
export type ExperimentRunResultPayload = ExperimentRunResult;

export type { ExperimentRunCompleteEvent };

/** Result of `experimentGetPaths` (success branch). */
export interface ExperimentPaths {
  registryPath: string;
  workspaceAbs: string;
  workspaceRel: string;
}

/** Event argument shape for the `onExperimentRunOutput` subscription. */
export interface ExperimentRunOutputEvent {
  id: string;
  runId: string;
  chunk: string;
}

/** In-flight UI run state — mirrors the executor's started state. */
export interface ExperimentRunInFlight {
  id: string;
  runId: string;
  command: string;
  /** Rolling PTY output (tail-truncated to match persisted run output). */
  liveOutput: string;
}

interface ExperimentDetail {
  meta: ExperimentMeta;
  runs: ExperimentRunEntry[];
  /** Total runs on disk (not capped by the loaded `runs` tail). */
  runCount: number;
  lastRunAt: string | null;
}

export interface ExperimentState {
  experiments: ExperimentSummary[];
  /** Registry dirs with missing/corrupt meta.json (from last list). */
  corruptIds: string[];
  selectedId: string | null;
  detail: ExperimentDetail | null;
  env: ExperimentEnv | null;
  runInFlight: ExperimentRunInFlight | null;
  /** Output chunks that arrived before runInFlight was set (keyed by runId). */
  runOutputBuffer: Record<string, string>;
  loading: boolean;
  error: string | null;
  /** Human browse: include archived islands in the list (toolbar toggle). */
  showArchived: boolean;

  /** Reload the experiment list for `projectRoot` (respects `showArchived`). */
  refreshList: (projectRoot: string) => Promise<void>;
  setShowArchived: (projectRoot: string, show: boolean) => Promise<void>;
  archiveExperiment: (projectRoot: string, id: string) => Promise<boolean>;
  restoreExperiment: (projectRoot: string, id: string) => Promise<boolean>;
  deleteExperiment: (
    projectRoot: string,
    id: string,
    opts?: { removeLab?: boolean },
  ) => Promise<boolean>;
  /**
   * Create an experiment via IPC, refresh the list, and open its detail tab.
   * Returns the new id on success, or null on failure (error stored on state).
   */
  createExperiment: (projectRoot: string, title: string) => Promise<string | null>;
  /**
   * Select an experiment by id, then fetch its detail (meta + runs) and
   * cached env detection. Returns the detail on success, or `null` if the
   * experiment was not found / the project has no Experiment folder.
   */
  selectExperiment: (
    projectRoot: string,
    id: string,
  ) => Promise<ExperimentDetail | null>;
  /** Leave detail view and return to the experiment card grid. */
  clearSelection: () => void;
  /**
   * Kick off a run via the IPC. Returns the assigned `runId` on success.
   * Run completion is delivered via the `onExperimentRunComplete`
   * subscription and handled in `handleRunComplete`.
   */
  runCommand: (
    projectRoot: string,
    id: string,
    command: string,
    artifacts?: string[],
    notes?: string,
    kind?: ExperimentRunKind,
  ) => Promise<string | null>;
  /**
   * Apply a `experiment:runComplete` event to the store. If the run
   * matches the selected experiment its entry is appended to `detail.runs`.
   * Always clears the matching in-flight marker.
   */
  handleRunComplete: (data: ExperimentRunCompleteEvent) => void;
  /** Append a live PTY chunk to the matching in-flight run. */
  handleRunOutput: (data: ExperimentRunOutputEvent) => void;
  /** Cancel an in-flight run via IPC. */
  cancelRun: (projectRoot: string, id: string, runId: string) => Promise<void>;
  /** Resolve the on-disk paths for an experiment (used by Files/Terminal buttons). */
  getPaths: (
    projectRoot: string,
    id: string,
  ) => Promise<ExperimentPaths | null>;
  /**
   * Focus the lab folder. Switches to the Files mode and returns the
   * resolved paths so the component can navigate the file tree to the
   * lab subfolder (Task 7). If no clean store API is available for
   * "open subfolder", callers should call `getPaths` and wire the open
   * from the component.
   */
  openLabInFiles: (
    projectRoot: string,
    id: string,
  ) => Promise<ExperimentPaths | null>;
  /** Clear error and transient state (used by mode lifecycle). */
  reset: () => void;
}

const INITIAL_STATE = {
  experiments: [] as ExperimentSummary[],
  corruptIds: [] as string[],
  selectedId: null as string | null,
  detail: null as ExperimentDetail | null,
  env: null as ExperimentEnv | null,
  runInFlight: null as ExperimentRunInFlight | null,
  runOutputBuffer: {} as Record<string, string>,
  loading: false,
  error: null as string | null,
  showArchived: false,
};

export const useExperimentStore = create<ExperimentState>((set, get) => ({
  ...INITIAL_STATE,

  refreshList: async (projectRoot) => {
    if (!projectRoot) return;
    set({ loading: true, error: null });
    try {
      // Archived toggle = archived-only view (not “include archived”).
      // IPC `includeArchived: true` returns the union; filter client-side.
      const archivedOnly = get().showArchived;
      const res = await window.electronAPI.experimentList(projectRoot, archivedOnly);
      if (!res.ok) {
        set({ experiments: [], corruptIds: [], loading: false, error: res.error });
        return;
      }
      const experiments = archivedOnly
        ? res.experiments.filter((e) => e.status === "archived")
        : res.experiments;
      set({
        experiments,
        corruptIds: res.corruptIds ?? [],
        loading: false,
        error: null,
      });
    } catch (err) {
      set({
        experiments: [],
        corruptIds: [],
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  setShowArchived: async (projectRoot, show) => {
    set({ showArchived: show });
    await get().refreshList(projectRoot);
  },

  archiveExperiment: async (projectRoot, id) => {
    if (!projectRoot || !id) return false;
    try {
      const res = await window.electronAPI.experimentArchive({ projectRoot, id });
      if (!res.ok) {
        set({ error: res.error });
        return false;
      }
      await get().refreshList(projectRoot);
      if (get().selectedId === id) {
        await get().selectExperiment(projectRoot, id);
      }
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  restoreExperiment: async (projectRoot, id) => {
    if (!projectRoot || !id) return false;
    try {
      const res = await window.electronAPI.experimentRestore({ projectRoot, id });
      if (!res.ok) {
        set({ error: res.error });
        return false;
      }
      await get().refreshList(projectRoot);
      if (get().selectedId === id) {
        await get().selectExperiment(projectRoot, id);
      }
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  deleteExperiment: async (projectRoot, id, opts) => {
    if (!projectRoot || !id) return false;
    try {
      const res = await window.electronAPI.experimentDelete({
        projectRoot,
        id,
        removeLab: opts?.removeLab,
      });
      if (!res.ok) {
        set({ error: res.error });
        return false;
      }
      useRightPanelStore.getState().closeExperimentTabs(id);
      if (get().selectedId === id) {
        set({ selectedId: null, detail: null, env: null });
      }
      await get().refreshList(projectRoot);
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  createExperiment: async (projectRoot, title) => {
    const trimmed = (title || "").trim();
    if (!projectRoot || !trimmed) {
      set({ error: "missing_title" });
      return null;
    }
    try {
      const res = await window.electronAPI.experimentCreate({
        projectRoot,
        title: trimmed,
      });
      if (!res.ok) {
        set({ error: res.hint || res.error });
        return null;
      }
      // Broadcast focus:true usually opens the tab; still refresh + open as fallback.
      await get().refreshList(projectRoot);
      useRightPanelStore.getState().openExperimentTab(res.id, res.meta.title);
      await get().selectExperiment(projectRoot, res.id);
      return res.id;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  clearSelection: () => {
    set({ selectedId: null, detail: null, env: null });
    useRightPanelStore.getState().activateExperimentsHomeTab();
  },

  selectExperiment: async (projectRoot, id) => {
    if (!projectRoot || !id) return null;
    set({ selectedId: id, error: null });
    try {
      const [readRes, envRes] = await Promise.all([
        window.electronAPI.experimentRead({ projectRoot, id, runsLimit: RUNS_LOAD_LIMIT }),
        window.electronAPI.experimentDetectEnv({ projectRoot, id }),
      ]);
      if (!readRes.ok) {
        // Clear selection so the detail view does not spin forever on a
        // missing / corrupt island; the content area can show the error.
        get().clearSelection();
        set({ error: readRes.error });
        return null;
      }
      const detail: ExperimentDetail = {
        meta: readRes.meta,
        runs: readRes.runs,
        runCount: readRes.runCount,
        lastRunAt: readRes.lastRunAt,
      };
      // Env detection is best-effort — keep the detail even if env probe fails.
      const env = envRes.ok ? envRes.env : null;
      set({ detail, env, error: null });
      return detail;
    } catch (err) {
      get().clearSelection();
      set({
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  },

  runCommand: async (projectRoot, id, command, artifacts, notes, kind) => {
    if (!projectRoot || !id || !command) return null;
    try {
      const chatSessionId = useChatStore.getState().sessionId ?? null;
      const res = await window.electronAPI.experimentRun({
        projectRoot,
        id,
        command,
        artifacts,
        notes,
        kind,
        chatSessionId,
      });
      if (!res.ok) {
        set({ error: res.error });
        return null;
      }
      const buffered = get().runOutputBuffer[res.runId] ?? "";
      const { [res.runId]: _removed, ...restBuffer } = get().runOutputBuffer;
      set({
        runInFlight: {
          id,
          runId: res.runId,
          command,
          liveOutput: tailBytes(buffered, RUN_OUTPUT_TAIL_BYTES),
        },
        runOutputBuffer: restBuffer,
        error: null,
      });
      return res.runId;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  handleRunComplete: (data) => {
    // Clear the in-flight marker if it matches the completed run.
    set((state) => {
      const inflight = state.runInFlight;
      const nextInflight =
        inflight && inflight.runId === data.runId && inflight.id === data.id
          ? null
          : inflight;
      // Drop any early-chunk buffer for this run (Bug #22).
      const { [data.runId]: _drop, ...restBuffer } = state.runOutputBuffer;

      // Only append to the visible detail if this is the currently selected
      // experiment — the run is already persisted in runs.jsonl on disk
      // and a future refresh will pick it up for any other id.
      if (
        // Append any run entry (success OR failure) - the executor's .catch
        // path (timeout/PTY error) writes a run with exitCode 124 to disk
        // and sends {ok:false, run}; the user must see it without a manual
        // refresh (plan §experiment:run 异步语义 step 4 - auto-append all runs).
        data.result.run &&
        state.selectedId === data.id &&
        state.detail
      ) {
        const run = data.result.run;
        // Dedup: experiment:changed → selectExperiment can race and land
        // the same runId already present before / after this append.
        const already = state.detail.runs.some((r) => r.runId === run.runId);
        const runCount = already
          ? state.detail.runCount
          : state.detail.runCount + 1;
        const lastRunAt = already
          ? state.detail.lastRunAt
          : (run.finishedAt ?? state.detail.lastRunAt);
        return {
          runInFlight: nextInflight,
          runOutputBuffer: restBuffer,
          detail: {
            meta: state.detail.meta,
            runs: already ? state.detail.runs : [...state.detail.runs, run],
            runCount,
            lastRunAt,
          },
        };
      }
      return { runInFlight: nextInflight, runOutputBuffer: restBuffer };
    });
  },

  handleRunOutput: (data) => {
    set((state) => {
      if (!data.chunk) return state;

      const inflight = state.runInFlight;
      if (
        inflight &&
        inflight.id === data.id &&
        inflight.runId === data.runId
      ) {
        const next = stripAnsi(inflight.liveOutput + data.chunk);
        return {
          runInFlight: {
            ...inflight,
            liveOutput: tailBytes(next, RUN_OUTPUT_TAIL_BYTES),
          },
        };
      }

      // Buffer early chunks until runCommand sets runInFlight.
      const prev = state.runOutputBuffer[data.runId] ?? "";
      return {
        runOutputBuffer: {
          ...state.runOutputBuffer,
          [data.runId]: tailBytes(stripAnsi(prev + data.chunk), RUN_OUTPUT_TAIL_BYTES),
        },
      };
    });
  },

  cancelRun: async (projectRoot, id, runId) => {
    try {
      await window.electronAPI.experimentCancelRun({ projectRoot, id, runId });
    } catch {
      // Best-effort — clear the in-flight marker regardless of IPC outcome.
    }
    set((state) => {
      const { [runId]: _drop, ...restBuffer } = state.runOutputBuffer;
      const inflight = state.runInFlight;
      if (inflight && inflight.runId === runId && inflight.id === id) {
        return { runInFlight: null, runOutputBuffer: restBuffer };
      }
      return { runOutputBuffer: restBuffer };
    });
  },

  getPaths: async (projectRoot, id) => {
    if (!projectRoot || !id) return null;
    try {
      const res = await window.electronAPI.experimentGetPaths({
        projectRoot,
        id,
      });
      if (!res.ok) {
        set({ error: res.error });
        return null;
      }
      return {
        registryPath: res.registryPath,
        workspaceAbs: res.workspaceAbs,
        workspaceRel: res.workspaceRel,
      };
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  openLabInFiles: async (projectRoot, id) => {
    const paths = await get().getPaths(projectRoot, id);
    if (!paths) return null;
    // Switch to Files mode + reveal the lab subfolder in the file tree.
    useLayoutStore.getState().activateMode("files");
    navigateFileTreeToPath(paths.workspaceRel);
    return paths;
  },

  reset: () => set({ ...INITIAL_STATE }),
}));

// Wire run events once at module load — mirrors literature-store.
// Unsub via globalThis so Vite HMR does not stack listeners (Bug #13 family).
const gRunEvents = globalThis as typeof globalThis & {
  __prismExperimentRunCompleteUnsub?: (() => void) | null;
  __prismExperimentRunOutputUnsub?: (() => void) | null;
};
if (typeof window !== "undefined" && window.electronAPI?.onExperimentRunComplete) {
  gRunEvents.__prismExperimentRunCompleteUnsub?.();
  gRunEvents.__prismExperimentRunCompleteUnsub = window.electronAPI.onExperimentRunComplete(
    (data) => {
      useExperimentStore.getState().handleRunComplete(data);
    },
  );
}
if (typeof window !== "undefined" && window.electronAPI?.onExperimentRunOutput) {
  gRunEvents.__prismExperimentRunOutputUnsub?.();
  gRunEvents.__prismExperimentRunOutputUnsub = window.electronAPI.onExperimentRunOutput((data) => {
    useExperimentStore.getState().handleRunOutput(data);
  });
}

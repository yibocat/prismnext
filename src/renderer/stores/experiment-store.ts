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
  ExperimentRunEntry,
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

/** Result payload broadcast by main on `experiment:runComplete`. */
export interface ExperimentRunResultPayload {
  ok: boolean;
  run?: ExperimentRunEntry;
  exitCode?: number;
  stdoutTail?: string;
  stderrTail?: string;
  error?: string;
}

/** Event argument shape for the `onExperimentRunComplete` subscription. */
export interface ExperimentRunCompleteEvent {
  id: string;
  runId: string;
  result: ExperimentRunResultPayload;
}

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
}

export interface ExperimentState {
  experiments: ExperimentSummary[];
  selectedId: string | null;
  detail: ExperimentDetail | null;
  env: ExperimentEnv | null;
  runInFlight: ExperimentRunInFlight | null;
  /** Output chunks that arrived before runInFlight was set (keyed by runId). */
  runOutputBuffer: Record<string, string>;
  loading: boolean;
  error: string | null;

  /** Reload the experiment list for `projectRoot`. */
  refreshList: (projectRoot: string) => Promise<void>;
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
  selectedId: null as string | null,
  detail: null as ExperimentDetail | null,
  env: null as ExperimentEnv | null,
  runInFlight: null as ExperimentRunInFlight | null,
  runOutputBuffer: {} as Record<string, string>,
  loading: false,
  error: null as string | null,
};

export const useExperimentStore = create<ExperimentState>((set, get) => ({
  ...INITIAL_STATE,

  refreshList: async (projectRoot) => {
    if (!projectRoot) return;
    set({ loading: true, error: null });
    try {
      const res = await window.electronAPI.experimentList(projectRoot);
      if (!res.ok) {
        set({ experiments: [], loading: false, error: res.error });
        return;
      }
      set({ experiments: res.experiments, loading: false, error: null });
    } catch (err) {
      set({
        experiments: [],
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  clearSelection: () => {
    set({ selectedId: null, detail: null, env: null });
    const rp = useRightPanelStore.getState();
    const activeTab = rp.tabs.find((t) => t.id === rp.activeTabId);
    if (activeTab?.kind === "experiments") {
      rp.updateTab(activeTab.id, {
        experimentId: undefined,
        experimentsView: "list",
        title: "Experiments",
      });
    }
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
        set({ detail: null, env: null, error: readRes.error });
        return null;
      }
      const detail: ExperimentDetail = {
        meta: readRes.meta,
        runs: readRes.runs,
      };
      // Env detection is best-effort — keep the detail even if env probe fails.
      const env = envRes.ok ? envRes.env : null;
      set({ detail, env });
      return detail;
    } catch (err) {
      set({
        detail: null,
        env: null,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  },

  runCommand: async (projectRoot, id, command, artifacts, notes) => {
    if (!projectRoot || !id || !command) return null;
    try {
      const chatSessionId = useChatStore.getState().sessionId ?? null;
      const res = await window.electronAPI.experimentRun({
        projectRoot,
        id,
        command,
        artifacts,
        notes,
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
        return {
          runInFlight: nextInflight,
          detail: {
            meta: state.detail.meta,
            runs: [...state.detail.runs, data.result.run],
          },
        };
      }
      return { runInFlight: nextInflight };
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
      const inflight = state.runInFlight;
      if (inflight && inflight.runId === runId && inflight.id === id) {
        return { runInFlight: null };
      }
      return state;
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

// Wire the run-complete event once at module load — mirrors the
// literature-store pattern (see setPdfDownloadProgress subscription at
// the bottom of literature-store.ts).
if (typeof window !== "undefined" && window.electronAPI?.onExperimentRunComplete) {
  window.electronAPI.onExperimentRunComplete((data) => {
    useExperimentStore.getState().handleRunComplete(data);
  });
}
if (typeof window !== "undefined" && window.electronAPI?.onExperimentRunOutput) {
  window.electronAPI.onExperimentRunOutput((data) => {
    useExperimentStore.getState().handleRunOutput(data);
  });
}

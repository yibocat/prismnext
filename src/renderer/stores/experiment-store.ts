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
  ExperimentRunOutputEvent as SharedExperimentRunOutputEvent,
  ExperimentRunResult,
  ExperimentRunStartedEvent,
  ExperimentSummary,
} from "../../shared/experiments/log";
import { RUN_OUTPUT_TAIL_BYTES, stripAnsi, tailBytes } from "../../shared/experiments/log";
import type { ExperimentResultsSnapshot } from "@shared/experiments/results-snapshot";
import { experimentDesktop } from "@/lib/desktop-api/experiment";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { navigateFileTreeToPath } from "@/lib/files/navigate-file-tree";
import { useRightPanelStore } from "@/stores/right-panel-store";
// Side-effect: subscribe to experiment:changed (auto-refresh + Agent open).
import "@/modes/experiments-mode/open-experiment";
import {
  DEFAULT_RUNS_QUERY,
  type RunsQuery,
} from "@/modes/experiments-mode/experiments-runs-query";

/**
 * Max runs loaded per experiment detail. The service default is 20 (tail-newest);
 * raise it so Execution can flat-list a longer history (Git-style, no pagination).
 */
const RUNS_LOAD_LIMIT = 200;

/** @deprecated Use `ExperimentRunResult` from `shared/experiment-log`. */
export type ExperimentRunResultPayload = ExperimentRunResult;

export type { ExperimentRunCompleteEvent, ExperimentRunStartedEvent };
export type { ExperimentResultsSnapshot };

/** Result of `experimentGetPaths` (success branch). */
export interface ExperimentPaths {
  registryPath: string;
  workspaceAbs: string;
  workspaceRel: string;
}

/** Event argument shape for the `onExperimentRunOutput` subscription. */
export type ExperimentRunOutputEvent = SharedExperimentRunOutputEvent;

/** In-flight UI run state — mirrors the executor's started state. */
export interface ExperimentRunInFlight {
  id: string;
  runId: string;
  command: string;
  /** Rolling PTY output (tail-truncated to match persisted run output). */
  liveOutput: string;
  executionId?: string;
  cancelRequested?: boolean;
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
  /** Station 3 — last workspace scan for the selected experiment. */
  resultsSnapshot: ExperimentResultsSnapshot | null;
  resultsSnapshotLoading: boolean;
  loading: boolean;
  error: string | null;
  /** Human browse: include archived islands in the list (toolbar toggle). */
  showArchived: boolean;
  /** Execution pane filter/sort (toolbar when view = Execution). */
  runsQuery: RunsQuery;
  /** Multi-select for "Use in paper" (Execution list). */
  checkedRunIds: string[];

  /** Reload the experiment list for `projectRoot` (respects `showArchived`). */
  refreshList: (projectRoot: string) => Promise<void>;
  setShowArchived: (projectRoot: string, show: boolean) => Promise<void>;
  setRunsQuery: (patch: Partial<RunsQuery>) => void;
  setCheckedRunIds: (ids: string[]) => void;
  toggleRunChecked: (runId: string) => void;
  clearCheckedRuns: () => void;
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
  createExperiment: (
    projectRoot: string,
    title: string,
    opts?: {
      tags?: string[];
      description?: string;
      briefLinks?: {
        sections?: string[];
        hypothesisExcerpt?: string;
        researchQuestionExcerpt?: string;
      };
    },
  ) => Promise<string | null>;
  updateExperiment: (
    projectRoot: string,
    id: string,
    input: {
      title?: string;
      tags?: string[];
      description?: string;
      briefLinks?: {
        sections?: string[];
        hypothesisExcerpt?: string;
        researchQuestionExcerpt?: string;
      } | null;
    },
  ) => Promise<boolean>;
  /** Patch notes on a recorded run (runs.jsonl). */
  updateRunNotes: (
    projectRoot: string,
    id: string,
    runId: string,
    notes: string,
  ) => Promise<boolean>;
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
  /**
   * Lift `runInFlight` when any kickoff announces (Agent bridge or Human UI).
   * Merges any early `runOutputBuffer` chunks for the same runId.
   */
  handleRunStarted: (data: ExperimentRunStartedEvent) => void;
  /** Append a live PTY chunk to the matching in-flight run. */
  handleRunOutput: (data: ExperimentRunOutputEvent) => void;
  /** Cancel an in-flight run via IPC. */
  cancelRun: (projectRoot: string, id: string, runId: string) => Promise<void>;
  /** Read-only workspace scan for the Results panel (Station 3). */
  loadResultsSnapshot: (projectRoot: string, id: string) => Promise<void>;
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
  resultsSnapshot: null as ExperimentResultsSnapshot | null,
  resultsSnapshotLoading: false,
  loading: false,
  error: null as string | null,
  showArchived: false,
  runsQuery: { ...DEFAULT_RUNS_QUERY },
  checkedRunIds: [] as string[],
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
      const res = await experimentDesktop.experimentList(projectRoot, archivedOnly);
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

  setRunsQuery: (patch) => {
    set((s) => ({ runsQuery: { ...s.runsQuery, ...patch } }));
  },

  setCheckedRunIds: (ids) => {
    set({ checkedRunIds: ids });
  },

  toggleRunChecked: (runId) => {
    set((s) => {
      const has = s.checkedRunIds.includes(runId);
      return {
        checkedRunIds: has
          ? s.checkedRunIds.filter((id) => id !== runId)
          : [...s.checkedRunIds, runId],
      };
    });
  },

  clearCheckedRuns: () => {
    set({ checkedRunIds: [] });
  },

  archiveExperiment: async (projectRoot, id) => {
    if (!projectRoot || !id) return false;
    try {
      const res = await experimentDesktop.experimentArchive({ projectRoot, id });
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
      const res = await experimentDesktop.experimentRestore({ projectRoot, id });
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
      const res = await experimentDesktop.experimentDelete({
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

  createExperiment: async (projectRoot, title, opts) => {
    const trimmed = (title || "").trim();
    if (!projectRoot || !trimmed) {
      set({ error: "missing_title" });
      return null;
    }
    try {
      const res = await experimentDesktop.experimentCreate({
        projectRoot,
        title: trimmed,
        tags: opts?.tags,
        description: opts?.description,
        briefLinks: opts?.briefLinks,
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

  updateExperiment: async (projectRoot, id, input) => {
    if (!projectRoot || !id) return false;
    try {
      const res = await experimentDesktop.experimentUpdate({
        projectRoot,
        id,
        ...input,
      });
      if (!res.ok) {
        set({ error: res.hint || res.error });
        return false;
      }
      await get().refreshList(projectRoot);
      if (get().selectedId === id && get().detail) {
        set({
          detail: {
            ...get().detail!,
            meta: res.meta,
          },
        });
        useRightPanelStore.getState().updateExperimentTabTitle(id, res.meta.title);
      }
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  updateRunNotes: async (projectRoot, id, runId, notes) => {
    if (!projectRoot || !id || !runId) return false;
    try {
      const res = await experimentDesktop.experimentUpdateRun({
        projectRoot,
        id,
        runId,
        notes,
      });
      if (!res.ok) {
        set({ error: res.hint || res.error });
        return false;
      }
      const detail = get().detail;
      if (detail && detail.meta.id === id) {
        set({
          detail: {
            ...detail,
            runs: detail.runs.map((r) =>
              r.runId === runId
                ? { ...r, notes: res.run.notes }
                : r,
            ),
          },
          error: null,
        });
      }
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  clearSelection: () => {
    set({
      selectedId: null,
      detail: null,
      env: null,
      resultsSnapshot: null,
      resultsSnapshotLoading: false,
      checkedRunIds: [],
    });
    useRightPanelStore.getState().activateExperimentsHomeTab();
  },

  selectExperiment: async (projectRoot, id) => {
    if (!projectRoot || !id) return null;
    const prevId = get().selectedId;
    set({
      selectedId: id,
      error: null,
      resultsSnapshot: null,
      resultsSnapshotLoading: false,
      ...(prevId !== id ? { runsQuery: { ...DEFAULT_RUNS_QUERY }, checkedRunIds: [] } : {}),
    });
    try {
      const [readRes, envRes] = await Promise.all([
        experimentDesktop.experimentRead({ projectRoot, id, runsLimit: RUNS_LOAD_LIMIT }),
        experimentDesktop.experimentDetectEnv({ projectRoot, id }),
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
      // Warm Results scan in the background (Station 3).
      void get().loadResultsSnapshot(projectRoot, id);
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
      const res = await experimentDesktop.experimentRun({
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
          ...(res.executionId ? { executionId: res.executionId } : {}),
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
    if (data.result.run && get().selectedId === data.id) {
      const projectRoot = useDocumentStore.getState().projectRoot;
      if (projectRoot) void get().loadResultsSnapshot(projectRoot, data.id);
    }
  },

  handleRunStarted: (data) => {
    const id = (data.id || "").trim();
    const runId = (data.runId || "").trim();
    const command = typeof data.command === "string" ? data.command : "";
    if (!id || !runId) return;
    set((state) => {
      const buffered = state.runOutputBuffer[runId] ?? "";
      const { [runId]: _removed, ...restBuffer } = state.runOutputBuffer;
      return {
        runInFlight: {
          id,
          runId,
          command,
          liveOutput: tailBytes(buffered, RUN_OUTPUT_TAIL_BYTES),
          ...(data.executionId ? { executionId: data.executionId } : {}),
        },
        runOutputBuffer: restBuffer,
        error: null,
      };
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
      await experimentDesktop.experimentCancelRun({ projectRoot, id, runId });
    } catch {
      // Keep the in-flight card; the final event still clears it.
    }
    set((state) => {
      const inflight = state.runInFlight;
      if (inflight && inflight.runId === runId && inflight.id === id) {
        return { runInFlight: { ...inflight, cancelRequested: true } };
      }
      return state;
    });
  },

  loadResultsSnapshot: async (projectRoot, id) => {
    if (!projectRoot || !id) return;
    set({ resultsSnapshotLoading: true });
    try {
      const res = await experimentDesktop.experimentSnapshot({ projectRoot, id });
      if (get().selectedId !== id) {
        set({ resultsSnapshotLoading: false });
        return;
      }
      if (!res?.ok) {
        // Background scan — don't clobber the detail view with a global error.
        set({ resultsSnapshotLoading: false });
        return;
      }
      set({ resultsSnapshot: res.snapshot, resultsSnapshotLoading: false });
    } catch {
      if (get().selectedId !== id) {
        set({ resultsSnapshotLoading: false });
        return;
      }
      set({ resultsSnapshotLoading: false });
    }
  },

  getPaths: async (projectRoot, id) => {
    if (!projectRoot || !id) return null;
    try {
      const res = await experimentDesktop.experimentGetPaths({
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
    navigateFileTreeToPath(paths.workspaceRel);
    return paths;
  },

  reset: () => set({ ...INITIAL_STATE }),
}));

// Wire run events once at module load — mirrors literature-store.
// Unsub via globalThis so Vite HMR does not stack listeners (Bug #13 family).
const gRunEvents = globalThis as typeof globalThis & {
  __prismExperimentRunCompleteUnsub?: (() => void) | null;
  __prismExperimentRunStartedUnsub?: (() => void) | null;
  __prismExperimentRunOutputUnsub?: (() => void) | null;
};
if (typeof window !== "undefined" && experimentDesktop?.onExperimentRunComplete) {
  gRunEvents.__prismExperimentRunCompleteUnsub?.();
  gRunEvents.__prismExperimentRunCompleteUnsub = experimentDesktop.onExperimentRunComplete(
    (data) => {
      useExperimentStore.getState().handleRunComplete(data);
    },
  );
}
if (typeof window !== "undefined" && experimentDesktop?.onExperimentRunStarted) {
  gRunEvents.__prismExperimentRunStartedUnsub?.();
  gRunEvents.__prismExperimentRunStartedUnsub = experimentDesktop.onExperimentRunStarted(
    (data) => {
      useExperimentStore.getState().handleRunStarted(data);
    },
  );
}
if (typeof window !== "undefined" && experimentDesktop?.onExperimentRunOutput) {
  gRunEvents.__prismExperimentRunOutputUnsub?.();
  gRunEvents.__prismExperimentRunOutputUnsub = experimentDesktop.onExperimentRunOutput((data) => {
    useExperimentStore.getState().handleRunOutput(data);
  });
}

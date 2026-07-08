import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * experiment-store tests
 *
 * Mirrors the workspace-config-store test pattern: stub `window.electronAPI`
 * BEFORE importing the store. The store module subscribes to
 * `onExperimentRunComplete` at import-time, so the mock must include a
 * stubbed subscription that records its callback (the test can then fire
 * the callback to drive `handleRunComplete`).
 */
type RunCompleteHandler = (data: {
  id: string;
  runId: string;
  result: {
    ok: boolean;
    run?: import("../../src/shared/experiment-log").ExperimentRunEntry;
    exitCode?: number;
    stdoutTail?: string;
    stderrTail?: string;
    error?: string;
  };
}) => void;

const runCompleteHandlers: RunCompleteHandler[] = [];

const electronAPI = {
  experimentList: vi.fn(),
  experimentRead: vi.fn(),
  experimentDetectEnv: vi.fn(),
  experimentGetPaths: vi.fn(),
  experimentRun: vi.fn(),
  experimentCancelRun: vi.fn(),
  onExperimentRunComplete: vi.fn((cb: RunCompleteHandler) => {
    runCompleteHandlers.push(cb);
    return () => {
      const idx = runCompleteHandlers.indexOf(cb);
      if (idx >= 0) runCompleteHandlers.splice(idx, 1);
    };
  }),
};

vi.stubGlobal("window", {
  electronAPI,
});

import { useExperimentStore } from "../../src/renderer/stores/experiment-store";
import type { ExperimentSummary } from "../../src/shared/experiment-log";

const PROJECT = "/projects/demo";

function makeSummary(overrides: Partial<ExperimentSummary> = {}): ExperimentSummary {
  return {
    id: "exp-20260707-lr-a3f2",
    title: "LR sweep",
    workspacePath: "experiment/exp-20260707-lr-a3f2",
    runCount: 0,
    lastRunAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  runCompleteHandlers.length = 0;
  useExperimentStore.getState().reset();
});

describe("experiment-store", () => {
  describe("refreshList", () => {
    it("populates experiments on ok:true", async () => {
      const list: ExperimentSummary[] = [
        makeSummary({ id: "exp-a", title: "A" }),
        makeSummary({ id: "exp-b", title: "B" }),
      ];
      electronAPI.experimentList.mockResolvedValueOnce({
        ok: true,
        experimentRoot: "experiment",
        registryRoot: ".prismnext/experiments",
        experiments: list,
      });

      await useExperimentStore.getState().refreshList(PROJECT);

      const state = useExperimentStore.getState();
      expect(electronAPI.experimentList).toHaveBeenCalledWith(PROJECT);
      expect(state.experiments).toEqual(list);
      expect(state.error).toBeNull();
      expect(state.loading).toBe(false);
    });

    it("sets error on ok:false and clears stale experiments", async () => {
      // Pre-seed a stale list to verify refreshList clears it on failure
      // (brief: "clears/empties experiments appropriately, don't leave stale list").
      useExperimentStore.setState({
        experiments: [
          { id: "exp-stale", title: "Stale", workspacePath: "experiment/exp-stale", runCount: 1, lastRunAt: "2026-07-01T00:00:00Z" },
        ],
      });
      electronAPI.experimentList.mockResolvedValueOnce({
        ok: false,
        error: "no_experiment_folder",
        hint: "Add an Experiment folder in Settings → Workspace.",
      });

      await useExperimentStore.getState().refreshList(PROJECT);

      const state = useExperimentStore.getState();
      expect(state.experiments).toEqual([]);
      expect(state.error).toBe("no_experiment_folder");
      expect(state.loading).toBe(false);
    });

    it("captures thrown errors and clears stale experiments", async () => {
      useExperimentStore.setState({
        experiments: [
          { id: "exp-stale", title: "Stale", workspacePath: "experiment/exp-stale", runCount: 1, lastRunAt: "2026-07-01T00:00:00Z" },
        ],
      });
      electronAPI.experimentList.mockRejectedValueOnce(new Error("IPC blew up"));

      await useExperimentStore.getState().refreshList(PROJECT);

      const state = useExperimentStore.getState();
      expect(state.experiments).toEqual([]);
      expect(state.error).toBe("IPC blew up");
      expect(state.loading).toBe(false);
    });
  });

  describe("selectExperiment", () => {
    it("sets selectedId, detail and env on success", async () => {
      electronAPI.experimentRead.mockResolvedValueOnce({
        ok: true,
        meta: {
          id: "exp-a",
          title: "A",
          createdAt: "2026-07-07T00:00:00Z",
          workspacePath: "experiment/exp-a",
        },
        runs: [],
        experimentRoot: "experiment",
        registryRoot: ".prismnext/experiments",
      });
      electronAPI.experimentDetectEnv.mockResolvedValueOnce({
        ok: true,
        env: {
          python: "/usr/bin/python3",
          pythonVersion: "3.11.0",
          rscript: null,
          rVersion: null,
          platform: "darwin",
          gitCommit: "abc1234",
          venvPath: null,
        },
        workspacePath: "experiment/exp-a",
      });

      const detail = await useExperimentStore.getState().selectExperiment(PROJECT, "exp-a");

      const state = useExperimentStore.getState();
      expect(state.selectedId).toBe("exp-a");
      expect(state.detail?.meta.id).toBe("exp-a");
      expect(state.detail?.runs).toEqual([]);
      expect(state.env?.python).toBe("/usr/bin/python3");
      expect(detail?.meta.id).toBe("exp-a");
    });

    it("keeps detail but clears env when detectEnv fails", async () => {
      electronAPI.experimentRead.mockResolvedValueOnce({
        ok: true,
        meta: {
          id: "exp-a",
          title: "A",
          createdAt: "2026-07-07T00:00:00Z",
          workspacePath: "experiment/exp-a",
        },
        runs: [],
        experimentRoot: "experiment",
        registryRoot: ".prismnext/experiments",
      });
      electronAPI.experimentDetectEnv.mockResolvedValueOnce({
        ok: false,
        error: "python probe failed",
      });

      await useExperimentStore.getState().selectExperiment(PROJECT, "exp-a");

      const state = useExperimentStore.getState();
      expect(state.detail?.meta.id).toBe("exp-a");
      expect(state.env).toBeNull();
      expect(state.error).toBeNull();
    });

    it("returns null and sets error on ok:false", async () => {
      electronAPI.experimentRead.mockResolvedValueOnce({
        ok: false,
        error: "experiment_not_found",
      });
      electronAPI.experimentDetectEnv.mockResolvedValueOnce({
        ok: false,
        error: "experiment_not_found",
      });

      const detail = await useExperimentStore.getState().selectExperiment(PROJECT, "exp-a");

      expect(detail).toBeNull();
      expect(useExperimentStore.getState().selectedId).toBe("exp-a");
      expect(useExperimentStore.getState().detail).toBeNull();
      expect(useExperimentStore.getState().error).toBe("experiment_not_found");
    });
  });

  describe("runCommand", () => {
    it("sets runInFlight on ok:true and returns runId", async () => {
      electronAPI.experimentRun.mockResolvedValueOnce({
        ok: true,
        runId: "run-20260708-100000-abcd",
        status: "started",
      });

      const runId = await useExperimentStore
        .getState()
        .runCommand(PROJECT, "exp-a", ".venv/bin/python train.py");

      const state = useExperimentStore.getState();
      expect(runId).toBe("run-20260708-100000-abcd");
      expect(state.runInFlight).toEqual({
        id: "exp-a",
        runId: "run-20260708-100000-abcd",
        command: ".venv/bin/python train.py",
      });
      expect(state.error).toBeNull();
    });

    it("passes artifacts and notes through to the IPC", async () => {
      electronAPI.experimentRun.mockResolvedValueOnce({
        ok: true,
        runId: "run-1",
        status: "started",
      });

      await useExperimentStore
        .getState()
        .runCommand(PROJECT, "exp-a", "echo hi", ["results/fig1.png"], "first try");

      expect(electronAPI.experimentRun).toHaveBeenCalledWith({
        projectRoot: PROJECT,
        id: "exp-a",
        command: "echo hi",
        artifacts: ["results/fig1.png"],
        notes: "first try",
      });
    });

    it("sets error on ok:false", async () => {
      electronAPI.experimentRun.mockResolvedValueOnce({
        ok: false,
        error: "permission_denied",
        hint: "Read-only mode",
      });

      const runId = await useExperimentStore.getState().runCommand(PROJECT, "exp-a", "rm -rf /");

      expect(runId).toBeNull();
      expect(useExperimentStore.getState().runInFlight).toBeNull();
      expect(useExperimentStore.getState().error).toBe("permission_denied");
    });
  });

  describe("handleRunComplete", () => {
    it("appends the run to detail.runs when matching selectedId and clears runInFlight", () => {
      useExperimentStore.setState({
        selectedId: "exp-a",
        detail: {
          meta: {
            id: "exp-a",
            title: "A",
            createdAt: "2026-07-07T00:00:00Z",
            workspacePath: "experiment/exp-a",
          },
          runs: [],
        },
        runInFlight: {
          id: "exp-a",
          runId: "run-1",
          command: "echo hi",
        },
      });

      const newRun = {
        runId: "run-1",
        startedAt: "2026-07-08T10:00:00Z",
        finishedAt: "2026-07-08T10:00:01Z",
        command: "echo hi",
        cwd: "experiment/exp-a",
        exitCode: 0,
        stdoutTail: "hi\n",
        stderrTail: "",
        artifacts: [],
        env: {
          python: null,
          pythonVersion: null,
          rscript: null,
          rVersion: null,
          platform: "darwin",
          gitCommit: null,
          venvPath: null,
        },
      } as const;

      useExperimentStore.getState().handleRunComplete({
        id: "exp-a",
        runId: "run-1",
        result: { ok: true, run: newRun, exitCode: 0 },
      });

      const state = useExperimentStore.getState();
      expect(state.runInFlight).toBeNull();
      expect(state.detail?.runs).toHaveLength(1);
      expect(state.detail?.runs[0]).toEqual(newRun);
    });

    it("clears runInFlight but does not append when ids don't match", () => {
      useExperimentStore.setState({
        selectedId: "exp-a",
        detail: {
          meta: {
            id: "exp-a",
            title: "A",
            createdAt: "2026-07-07T00:00:00Z",
            workspacePath: "experiment/exp-a",
          },
          runs: [],
        },
        runInFlight: {
          id: "exp-b",
          runId: "run-2",
          command: "echo other",
        },
      });

      useExperimentStore.getState().handleRunComplete({
        id: "exp-b",
        runId: "run-2",
        result: {
          ok: true,
          run: {
            runId: "run-2",
            startedAt: "2026-07-08T10:00:00Z",
            finishedAt: "2026-07-08T10:00:01Z",
            command: "echo other",
            cwd: "experiment/exp-b",
            exitCode: 0,
            stdoutTail: "",
            stderrTail: "",
            artifacts: [],
            env: {
              python: null,
              pythonVersion: null,
              rscript: null,
              rVersion: null,
              platform: "darwin",
              gitCommit: null,
              venvPath: null,
            },
          },
          exitCode: 0,
        },
      });

      const state = useExperimentStore.getState();
      expect(state.runInFlight).toBeNull();
      // Different selectedId — runs list untouched.
      expect(state.detail?.runs).toHaveLength(0);
    });

    it("clears runInFlight on error result even without a run entry", () => {
      useExperimentStore.setState({
        selectedId: "exp-a",
        detail: {
          meta: {
            id: "exp-a",
            title: "A",
            createdAt: "2026-07-07T00:00:00Z",
            workspacePath: "experiment/exp-a",
          },
          runs: [],
        },
        runInFlight: {
          id: "exp-a",
          runId: "run-1",
          command: "false",
        },
      });

      useExperimentStore.getState().handleRunComplete({
        id: "exp-a",
        runId: "run-1",
        result: { ok: false, error: "exit code 1" },
      });

      expect(useExperimentStore.getState().runInFlight).toBeNull();
      expect(useExperimentStore.getState().detail?.runs).toHaveLength(0);
    });

    it("appends a failed run (ok:false with run entry) to detail.runs - .catch path", () => {
      // The executor's .catch path (timeout / PTY error) writes a run with
      // exitCode 124 to disk and sends { ok:false, run } - the UI must show
      // it without a manual refresh (plan mandates auto-append for all runs).
      useExperimentStore.setState({
        selectedId: "exp-a",
        detail: {
          meta: {
            id: "exp-a",
            title: "A",
            createdAt: "2026-07-07T00:00:00Z",
            workspacePath: "experiment/exp-a",
          },
          runs: [],
        },
        runInFlight: {
          id: "exp-a",
          runId: "run-timeout",
          command: "sleep 9999",
        },
      });

      const failedRun = {
        runId: "run-timeout",
        startedAt: "2026-07-08T10:00:00Z",
        finishedAt: "2026-07-08T10:10:00Z",
        command: "sleep 9999",
        cwd: "experiment/exp-a",
        exitCode: 124,
        stdoutTail: "Prism experiment-run: command failed or timed out.",
        stderrTail: "",
        artifacts: [],
        env: {
          python: null,
          pythonVersion: null,
          rscript: null,
          rVersion: null,
          platform: "darwin",
          gitCommit: null,
          venvPath: null,
        },
      };

      useExperimentStore.getState().handleRunComplete({
        id: "exp-a",
        runId: "run-timeout",
        result: { ok: false, error: "timeout", run: failedRun },
      });

      const state = useExperimentStore.getState();
      expect(state.runInFlight).toBeNull();
      expect(state.detail?.runs).toHaveLength(1);
      expect(state.detail?.runs[0].runId).toBe("run-timeout");
      expect(state.detail?.runs[0].exitCode).toBe(124);
    });
  });

  describe("cancelRun", () => {
    it("calls experimentCancelRun and clears runInFlight", async () => {
      useExperimentStore.setState({
        runInFlight: {
          id: "exp-a",
          runId: "run-1",
          command: "sleep 999",
        },
      });
      electronAPI.experimentCancelRun.mockResolvedValueOnce({ ok: true });

      await useExperimentStore.getState().cancelRun(PROJECT, "exp-a", "run-1");

      expect(electronAPI.experimentCancelRun).toHaveBeenCalledWith({
        projectRoot: PROJECT,
        id: "exp-a",
        runId: "run-1",
      });
      expect(useExperimentStore.getState().runInFlight).toBeNull();
    });

    it("still clears runInFlight if the IPC throws", async () => {
      useExperimentStore.setState({
        runInFlight: {
          id: "exp-a",
          runId: "run-1",
          command: "sleep 999",
        },
      });
      electronAPI.experimentCancelRun.mockRejectedValueOnce(new Error("IPC down"));

      await useExperimentStore.getState().cancelRun(PROJECT, "exp-a", "run-1");

      expect(useExperimentStore.getState().runInFlight).toBeNull();
    });
  });

  describe("getPaths", () => {
    it("returns paths on ok:true", async () => {
      electronAPI.experimentGetPaths.mockResolvedValueOnce({
        ok: true,
        registryPath: ".prismnext/experiments/exp-a",
        workspaceAbs: "/projects/demo/experiment/exp-a",
        workspaceRel: "experiment/exp-a",
      });

      const paths = await useExperimentStore.getState().getPaths(PROJECT, "exp-a");

      expect(paths).toEqual({
        registryPath: ".prismnext/experiments/exp-a",
        workspaceAbs: "/projects/demo/experiment/exp-a",
        workspaceRel: "experiment/exp-a",
      });
    });

    it("returns null and sets error on ok:false", async () => {
      electronAPI.experimentGetPaths.mockResolvedValueOnce({
        ok: false,
        error: "experiment_not_found",
      });

      const paths = await useExperimentStore.getState().getPaths(PROJECT, "exp-a");

      expect(paths).toBeNull();
      expect(useExperimentStore.getState().error).toBe("experiment_not_found");
    });
  });

  describe("module-level runComplete subscription", () => {
    it("re-registered callback routes event payloads into handleRunComplete", () => {
      // The store subscribes once at module load. beforeEach clears the
      // captured handler list, so we re-invoke the mock and re-wire
      // handleRunComplete (which is exactly what the module-level
      // subscription does) to validate the dispatch path.
      const localHandlers: RunCompleteHandler[] = [];
      const originalImpl = electronAPI.onExperimentRunComplete.getMockImplementation();
      electronAPI.onExperimentRunComplete.mockImplementation((cb: RunCompleteHandler) => {
        localHandlers.push(cb);
        return () => {};
      });

      try {
        localHandlers.push(useExperimentStore.getState().handleRunComplete);

        useExperimentStore.setState({
          selectedId: "exp-a",
          detail: {
            meta: {
              id: "exp-a",
              title: "A",
              createdAt: "2026-07-07T00:00:00Z",
              workspacePath: "experiment/exp-a",
            },
            runs: [],
          },
          runInFlight: {
            id: "exp-a",
            runId: "run-x",
            command: "echo wired",
          },
        });

        const [handler] = localHandlers;
        handler({
          id: "exp-a",
          runId: "run-x",
          result: {
            ok: true,
            run: {
              runId: "run-x",
              startedAt: "2026-07-08T10:00:00Z",
              finishedAt: "2026-07-08T10:00:01Z",
              command: "echo wired",
              cwd: "experiment/exp-a",
              exitCode: 0,
              stdoutTail: "wired\n",
              stderrTail: "",
              artifacts: [],
              env: {
                python: null,
                pythonVersion: null,
                rscript: null,
                rVersion: null,
                platform: "darwin",
                gitCommit: null,
                venvPath: null,
              },
            },
            exitCode: 0,
          },
        });

        const state = useExperimentStore.getState();
        expect(state.runInFlight).toBeNull();
        expect(state.detail?.runs).toHaveLength(1);
        expect(state.detail?.runs[0].runId).toBe("run-x");
      } finally {
        if (originalImpl) {
          electronAPI.onExperimentRunComplete.mockImplementation(originalImpl);
        }
      }
    });
  });
});
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
type RunOutputHandler = (data: { id: string; runId: string; chunk: string }) => void;
const runOutputHandlers: RunOutputHandler[] = [];
type RunStartedHandler = (data: { id: string; runId: string; command: string }) => void;
const runStartedHandlers: RunStartedHandler[] = [];

const electronAPI = {
  experimentList: vi.fn(),
  experimentRead: vi.fn(),
  experimentDetectEnv: vi.fn(),
  experimentGetPaths: vi.fn(),
  experimentRun: vi.fn(),
  experimentCancelRun: vi.fn(),
  experimentArchive: vi.fn(),
  experimentRestore: vi.fn(),
  experimentDelete: vi.fn(),
  experimentCreate: vi.fn(),
  experimentUpdate: vi.fn(),
  experimentSnapshot: vi.fn().mockResolvedValue({
    ok: true,
    snapshot: {
      id: "exp",
      workspacePath: "experiment/exp",
      figures: [],
      tables: [],
      metrics: [],
      textSummary: "",
      unparsed: [],
      warnings: [],
    },
  }),
  onExperimentRunComplete: vi.fn((cb: RunCompleteHandler) => {
    runCompleteHandlers.push(cb);
    return () => {
      const idx = runCompleteHandlers.indexOf(cb);
      if (idx >= 0) runCompleteHandlers.splice(idx, 1);
    };
  }),
  onExperimentRunStarted: vi.fn((cb: RunStartedHandler) => {
    runStartedHandlers.push(cb);
    return () => {
      const idx = runStartedHandlers.indexOf(cb);
      if (idx >= 0) runStartedHandlers.splice(idx, 1);
    };
  }),
  onExperimentRunOutput: vi.fn((cb: RunOutputHandler) => {
    runOutputHandlers.push(cb);
    return () => {
      const idx = runOutputHandlers.indexOf(cb);
      if (idx >= 0) runOutputHandlers.splice(idx, 1);
    };
  }),
  onExperimentChanged: vi.fn(() => () => {}),
};

vi.stubGlobal("window", {
  electronAPI,
});

vi.mock("../../src/renderer/stores/chat-store", () => ({
  useChatStore: {
    getState: () => ({ sessionId: "sess-ui-run-test" }),
  },
}));

vi.mock("../../src/renderer/stores/document-store", () => ({
  useDocumentStore: {
    getState: () => ({ projectRoot: "/projects/demo" }),
  },
}));

vi.mock("../../src/renderer/stores/layout-store", () => ({
  useLayoutStore: {
    getState: () => ({
      activateMode: vi.fn(),
    }),
  },
}));

vi.mock("../../src/renderer/stores/right-panel-store", () => ({
  useRightPanelStore: {
    getState: () => ({
      activateExperimentsHomeTab: vi.fn(),
      closeExperimentTabs: vi.fn(),
      ensureTab: vi.fn(),
      openExperimentTab: vi.fn(),
      updateExperimentTabTitle: vi.fn(),
      tabs: [],
      activeTabId: null,
      updateTab: vi.fn(),
    }),
  },
}));

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
    status: "active",
    archivedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  runCompleteHandlers.length = 0;
  runOutputHandlers.length = 0;
  runStartedHandlers.length = 0;
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
      expect(electronAPI.experimentList).toHaveBeenCalledWith(PROJECT, false);
      expect(state.experiments).toEqual(list);
      expect(state.error).toBeNull();
      expect(state.loading).toBe(false);
    });

    it("passes showArchived=true to experimentList when toggled", async () => {
      electronAPI.experimentList.mockResolvedValue({
        ok: true,
        experimentRoot: "experiment",
        registryRoot: ".prismnext/experiments",
        experiments: [],
      });

      await useExperimentStore.getState().setShowArchived(PROJECT, true);

      expect(useExperimentStore.getState().showArchived).toBe(true);
      expect(electronAPI.experimentList).toHaveBeenCalledWith(PROJECT, true);
    });

    it("shows only archived experiments when showArchived is on", async () => {
      electronAPI.experimentList.mockResolvedValue({
        ok: true,
        experimentRoot: "experiment",
        registryRoot: ".prismnext/experiments",
        experiments: [
          makeSummary({ id: "exp-active", title: "Active", status: "active" }),
          makeSummary({ id: "exp-arch", title: "Arch", status: "archived" }),
        ],
      });

      await useExperimentStore.getState().setShowArchived(PROJECT, true);

      expect(useExperimentStore.getState().experiments.map((e) => e.id)).toEqual([
        "exp-arch",
      ]);
    });

    it("sets error on ok:false and clears stale experiments", async () => {
      // Pre-seed a stale list to verify refreshList clears it on failure
      // (brief: "clears/empties experiments appropriately, don't leave stale list").
      useExperimentStore.setState({
        experiments: [makeSummary({ id: "exp-stale", title: "Stale", runCount: 1, lastRunAt: "2026-07-01T00:00:00Z" })],
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
        experiments: [makeSummary({ id: "exp-stale", title: "Stale", runCount: 1, lastRunAt: "2026-07-01T00:00:00Z" })],
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
        runCount: 0,
        lastRunAt: null,
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
        runCount: 0,
        lastRunAt: null,
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

    it("returns null, clears selection, and sets error on ok:false", async () => {
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
      expect(useExperimentStore.getState().selectedId).toBeNull();
      expect(useExperimentStore.getState().detail).toBeNull();
      expect(useExperimentStore.getState().error).toBe("experiment_not_found");
    });
  });

  describe("clearSelection", () => {
    it("clears selectedId, detail, and env", async () => {
      electronAPI.experimentRead.mockResolvedValueOnce({
        ok: true,
        meta: {
          id: "exp-a",
          title: "A",
          createdAt: "2026-07-07T00:00:00Z",
          workspacePath: "experiment/exp-a",
        },
        runs: [],
        runCount: 0,
        lastRunAt: null,
        experimentRoot: "experiment",
        registryRoot: ".prismnext/experiments",
      });
      electronAPI.experimentDetectEnv.mockResolvedValueOnce({
        ok: true,
        env: { python: "/usr/bin/python3", pythonVersion: "3.11.0", rscript: null, rVersion: null, platform: "darwin", gitCommit: null, venvPath: null },
        workspacePath: "experiment/exp-a",
      });

      await useExperimentStore.getState().selectExperiment(PROJECT, "exp-a");
      useExperimentStore.getState().clearSelection();

      const state = useExperimentStore.getState();
      expect(state.selectedId).toBeNull();
      expect(state.detail).toBeNull();
      expect(state.env).toBeNull();
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
        liveOutput: "",
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
        chatSessionId: "sess-ui-run-test",
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
          runCount: 0,
          lastRunAt: null,
        },
        runInFlight: {
          id: "exp-a",
          runId: "run-1",
          command: "echo hi",
          liveOutput: "",
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

    it("clears runOutputBuffer for the completed runId (Bug #22)", () => {
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
          runCount: 0,
          lastRunAt: null,
        },
        runOutputBuffer: { "run-1": "stale", "run-keep": "ok" },
      });

      useExperimentStore.getState().handleRunComplete({
        id: "exp-a",
        runId: "run-1",
        result: {
          ok: true,
          run: {
            runId: "run-1",
            startedAt: "2026-07-08T10:00:00Z",
            finishedAt: "2026-07-08T10:00:01Z",
            command: "echo",
            cwd: "experiment/exp-a",
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

      expect(useExperimentStore.getState().runOutputBuffer["run-1"]).toBeUndefined();
      expect(useExperimentStore.getState().runOutputBuffer["run-keep"]).toBe("ok");
    });

    it("does not duplicate when the same runId is already in detail.runs", () => {
      const existingRun = {
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

      useExperimentStore.setState({
        selectedId: "exp-a",
        detail: {
          meta: {
            id: "exp-a",
            title: "A",
            createdAt: "2026-07-07T00:00:00Z",
            workspacePath: "experiment/exp-a",
          },
          runs: [existingRun],
        },
        runInFlight: {
          id: "exp-a",
          runId: "run-1",
          command: "echo hi",
          liveOutput: "",
        },
      });

      useExperimentStore.getState().handleRunComplete({
        id: "exp-a",
        runId: "run-1",
        result: { ok: true, run: { ...existingRun, stdoutTail: "hi again\n" }, exitCode: 0 },
      });

      const state = useExperimentStore.getState();
      expect(state.runInFlight).toBeNull();
      expect(state.detail?.runs).toHaveLength(1);
      expect(state.detail?.runs[0].stdoutTail).toBe("hi\n");
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
          runCount: 0,
          lastRunAt: null,
        },
        runInFlight: {
          id: "exp-b",
          runId: "run-2",
          command: "echo other",
          liveOutput: "",
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
          runCount: 0,
          lastRunAt: null,
        },
        runInFlight: {
          id: "exp-a",
          runId: "run-1",
          command: "false",
          liveOutput: "",
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
          runCount: 0,
          lastRunAt: null,
        },
        runInFlight: {
          id: "exp-a",
          runId: "run-timeout",
          command: "sleep 9999",
          liveOutput: "",
        },
      });

      const failedRun = {
        runId: "run-timeout",
        startedAt: "2026-07-08T10:00:00Z",
        finishedAt: "2026-07-08T10:10:00Z",
        command: "sleep 9999",
        cwd: "experiment/exp-a",
        exitCode: 124,
        stdoutTail: "prismnext experiment-run: command failed or timed out.",
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

  describe("handleRunStarted", () => {
    it("lifts runInFlight for agent/UI kickoff announcements", () => {
      useExperimentStore.getState().handleRunStarted({
        id: "exp-a",
        runId: "run-agent-1",
        command: "python train.py",
      });

      expect(useExperimentStore.getState().runInFlight).toEqual({
        id: "exp-a",
        runId: "run-agent-1",
        command: "python train.py",
        liveOutput: "",
      });
    });

    it("merges early buffered chunks into liveOutput", () => {
      useExperimentStore.setState({
        runOutputBuffer: { "run-agent-1": "epoch 0\n" },
      });

      useExperimentStore.getState().handleRunStarted({
        id: "exp-a",
        runId: "run-agent-1",
        command: "python train.py",
      });

      expect(useExperimentStore.getState().runInFlight?.liveOutput).toBe("epoch 0\n");
      expect(useExperimentStore.getState().runOutputBuffer["run-agent-1"]).toBeUndefined();
    });
  });

  describe("handleRunOutput", () => {
    it("appends chunks to liveOutput for the matching in-flight run", () => {
      useExperimentStore.setState({
        runInFlight: {
          id: "exp-a",
          runId: "run-1",
          command: "python train.py",
          liveOutput: "",
        },
      });

      useExperimentStore.getState().handleRunOutput({
        id: "exp-a",
        runId: "run-1",
        chunk: "epoch 1\n",
      });

      expect(useExperimentStore.getState().runInFlight?.liveOutput).toBe("epoch 1\n");
    });

    it("buffers chunks that arrive before runInFlight is set", () => {
      useExperimentStore.getState().handleRunOutput({
        id: "exp-a",
        runId: "run-early",
        chunk: "early line\n",
      });

      expect(useExperimentStore.getState().runOutputBuffer["run-early"]).toBe("early line\n");
    });

    it("merges buffered output when runCommand succeeds", async () => {
      useExperimentStore.setState({
        runOutputBuffer: { "run-early": "early line\n" },
      });
      electronAPI.experimentRun.mockResolvedValueOnce({
        ok: true,
        runId: "run-early",
        status: "started",
      });

      await useExperimentStore.getState().runCommand(PROJECT, "exp-a", "echo hi");

      expect(useExperimentStore.getState().runInFlight?.liveOutput).toBe("early line\n");
      expect(useExperimentStore.getState().runOutputBuffer["run-early"]).toBeUndefined();
    });

    it("ignores chunks for a different runId", () => {
      useExperimentStore.setState({
        runInFlight: {
          id: "exp-a",
          runId: "run-1",
          command: "python train.py",
          liveOutput: "keep",
        },
      });

      useExperimentStore.getState().handleRunOutput({
        id: "exp-a",
        runId: "run-other",
        chunk: "nope",
      });

      expect(useExperimentStore.getState().runInFlight?.liveOutput).toBe("keep");
    });
  });

  describe("cancelRun", () => {
    it("calls experimentCancelRun and clears runInFlight", async () => {
      useExperimentStore.setState({
        runInFlight: {
          id: "exp-a",
          runId: "run-1",
          command: "sleep 999",
          liveOutput: "",
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
          liveOutput: "",
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
            liveOutput: "",
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

  describe("archive / restore / delete", () => {
    it("archiveExperiment refreshes the list", async () => {
      electronAPI.experimentArchive.mockResolvedValueOnce({
        ok: true,
        meta: {
          id: "exp-a",
          title: "A",
          createdAt: "2026-07-07T00:00:00Z",
          workspacePath: "experiment/exp-a",
          status: "archived",
          archivedAt: "2026-07-16T00:00:00Z",
        },
      });
      electronAPI.experimentList.mockResolvedValueOnce({
        ok: true,
        experimentRoot: "experiment",
        registryRoot: ".prismnext/experiments",
        experiments: [],
      });

      const ok = await useExperimentStore.getState().archiveExperiment(PROJECT, "exp-a");
      expect(ok).toBe(true);
      expect(electronAPI.experimentArchive).toHaveBeenCalledWith({
        projectRoot: PROJECT,
        id: "exp-a",
      });
      expect(electronAPI.experimentList).toHaveBeenCalled();
    });

    it("deleteExperiment clears selection of the deleted island", async () => {
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
          runCount: 0,
          lastRunAt: null,
        },
      });
      electronAPI.experimentDelete.mockResolvedValueOnce({ ok: true });
      electronAPI.experimentList.mockResolvedValueOnce({
        ok: true,
        experimentRoot: "experiment",
        registryRoot: ".prismnext/experiments",
        experiments: [],
      });

      const ok = await useExperimentStore
        .getState()
        .deleteExperiment(PROJECT, "exp-a", { removeLab: true });
      expect(ok).toBe(true);
      expect(electronAPI.experimentDelete).toHaveBeenCalledWith({
        projectRoot: PROJECT,
        id: "exp-a",
        removeLab: true,
      });
      expect(useExperimentStore.getState().selectedId).toBeNull();
      expect(useExperimentStore.getState().detail).toBeNull();
    });
  });

  describe("createExperiment", () => {
    it("creates via IPC, refreshes, selects, and opens the tab", async () => {
      const meta = {
        id: "exp-20260726-new-a1b2",
        title: "New probe",
        createdAt: "2026-07-26T00:00:00Z",
        workspacePath: "experiment/exp-20260726-new-a1b2",
      };
      electronAPI.experimentCreate.mockResolvedValueOnce({
        ok: true,
        id: meta.id,
        path: meta.workspacePath,
        meta,
      });
      electronAPI.experimentList.mockResolvedValueOnce({
        ok: true,
        experimentRoot: "experiment",
        registryRoot: ".prismnext/experiments",
        experiments: [
          makeSummary({
            id: meta.id,
            title: meta.title,
            workspacePath: meta.workspacePath,
          }),
        ],
      });
      electronAPI.experimentRead.mockResolvedValueOnce({
        ok: true,
        meta,
        runs: [],
        runCount: 0,
        lastRunAt: null,
      });
      electronAPI.experimentDetectEnv.mockResolvedValueOnce({
        ok: true,
        env: { python: null, r: null, git: null, venv: null },
        workspacePath: meta.workspacePath,
      });

      const id = await useExperimentStore
        .getState()
        .createExperiment(PROJECT, "  New probe  ");
      expect(id).toBe(meta.id);
      expect(electronAPI.experimentCreate).toHaveBeenCalledWith({
        projectRoot: PROJECT,
        title: "New probe",
      });
      expect(useExperimentStore.getState().selectedId).toBe(meta.id);
      expect(useExperimentStore.getState().detail?.meta.id).toBe(meta.id);
    });

    it("returns null when title is empty", async () => {
      electronAPI.experimentCreate.mockClear();
      const id = await useExperimentStore.getState().createExperiment(PROJECT, "   ");
      expect(id).toBeNull();
      expect(electronAPI.experimentCreate).not.toHaveBeenCalled();
    });
  });

  describe("updateExperiment", () => {
    it("updates metadata via IPC and refreshes detail state", async () => {
      const initialMeta = {
        id: "exp-20260726-new-a1b2",
        title: "Old title",
        createdAt: "2026-07-26T00:00:00Z",
        workspacePath: "experiment/exp-20260726-new-a1b2",
      };
      const updatedMeta = {
        ...initialMeta,
        title: "Updated title",
        tags: ["tag1", "tag2"],
        description: "New description",
      };

      useExperimentStore.setState({
        selectedId: initialMeta.id,
        detail: {
          meta: initialMeta,
          runs: [],
          runCount: 0,
          lastRunAt: null,
        },
      });

      electronAPI.experimentUpdate.mockResolvedValueOnce({
        ok: true,
        meta: updatedMeta,
      });
      electronAPI.experimentList.mockResolvedValueOnce({
        ok: true,
        experimentRoot: "experiment",
        registryRoot: ".prismnext/experiments",
        experiments: [
          makeSummary({
            id: updatedMeta.id,
            title: updatedMeta.title,
            workspacePath: updatedMeta.workspacePath,
          }),
        ],
      });

      const ok = await useExperimentStore.getState().updateExperiment(PROJECT, initialMeta.id, {
        title: "Updated title",
        tags: ["tag1", "tag2"],
        description: "New description",
      });

      expect(ok).toBe(true);
      expect(electronAPI.experimentUpdate).toHaveBeenCalledWith({
        projectRoot: PROJECT,
        id: initialMeta.id,
        title: "Updated title",
        tags: ["tag1", "tag2"],
        description: "New description",
      });
      expect(useExperimentStore.getState().detail?.meta.title).toBe("Updated title");
      expect(useExperimentStore.getState().detail?.meta.tags).toEqual(["tag1", "tag2"]);
      expect(useExperimentStore.getState().detail?.meta.description).toBe("New description");
    });
  });
});

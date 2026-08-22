import { beforeEach, describe, expect, it, vi } from "vitest";

const executionListRunning = vi.fn();
const executionApplyProjectSwitch = vi.fn(async () => ({ ok: true }));
const agentDispose = vi.fn(async () => undefined);
const terminalDestroyAllAiPty = vi.fn(async () => undefined);

vi.stubGlobal("window", {
  electronAPI: {
    executionListRunning,
    executionApplyProjectSwitch,
    agentDispose,
    terminalDestroyAllAiPty,
  },
});

import { useExecutionStore } from "../../src/renderer/stores/execution-store";
import { useTabCloseConfirmStore } from "../../src/renderer/stores/tab-close-confirm-store";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyWorkbenchFocusChange,
  confirmProjectSwitchIfNeeded,
  listRunningExperimentIds,
} from "../../src/renderer/lib/workspace/project-lifecycle";

describe("project switch lifecycle", () => {
  beforeEach(() => {
    executionListRunning.mockReset();
    executionApplyProjectSwitch.mockReset();
    executionApplyProjectSwitch.mockResolvedValue({ ok: true });
    agentDispose.mockReset();
    terminalDestroyAllAiPty.mockReset();
    useExecutionStore.getState().reset();
    useTabCloseConfirmStore.setState({ pending: null });
  });

  it("lists only running experiment executions for a project", () => {
    useExecutionStore.setState({
      byId: {
        bash: {
          lastSequence: 1,
          tail: "",
          replaying: false,
          summary: {
            executionId: "bash",
            origin: "agent-bash",
            state: "running",
            command: "ls",
            cwd: "/tmp",
            projectId: "/proj-a",
            createdAt: 1,
          },
        },
        exp: {
          lastSequence: 1,
          tail: "",
          replaying: false,
          summary: {
            executionId: "exp",
            origin: "experiment-run",
            state: "running",
            command: "python train.py",
            cwd: "/tmp",
            projectId: "/proj-a",
            createdAt: 1,
          },
        },
        other: {
          lastSequence: 1,
          tail: "",
          replaying: false,
          summary: {
            executionId: "other",
            origin: "experiment-run",
            state: "running",
            command: "python other.py",
            cwd: "/tmp",
            projectId: "/proj-b",
            createdAt: 1,
          },
        },
      },
    });
    expect(listRunningExperimentIds("/proj-a")).toEqual(["exp"]);
  });

  it("continues without a dialog when no experiments are running", async () => {
    executionListRunning.mockResolvedValue({ ok: true, summaries: [] });
    await expect(confirmProjectSwitchIfNeeded("/proj-a")).resolves.toBe("continue");
    expect(useTabCloseConfirmStore.getState().pending).toBeNull();
  });

  it("resolves continue / stop / abort from the shared confirm dialog", async () => {
    executionListRunning.mockResolvedValue({
      ok: true,
      summaries: [{
        executionId: "exp",
        origin: "experiment-run",
        state: "running",
        command: "python train.py",
        cwd: "/tmp",
        projectId: "/proj-a",
        createdAt: 1,
      }],
    });

    const pending = confirmProjectSwitchIfNeeded("/proj-a");
    await vi.waitFor(() => {
      expect(useTabCloseConfirmStore.getState().pending?.secondaryLabel).toBeTruthy();
    });
    useTabCloseConfirmStore.getState().confirm();
    await expect(pending).resolves.toBe("continue");

    const stopPending = confirmProjectSwitchIfNeeded("/proj-a");
    await vi.waitFor(() => {
      expect(useTabCloseConfirmStore.getState().pending).not.toBeNull();
    });
    useTabCloseConfirmStore.getState().secondary();
    await expect(stopPending).resolves.toBe("stop");

    const abortPending = confirmProjectSwitchIfNeeded("/proj-a");
    await vi.waitFor(() => {
      expect(useTabCloseConfirmStore.getState().pending).not.toBeNull();
    });
    useTabCloseConfirmStore.getState().cancel();
    await expect(abortPending).resolves.toBe("abort");
  });

  it("does not export the leftover full-teardown switch helper", async () => {
    const lifecycle = await import("../../src/renderer/lib/workspace/project-lifecycle");
    expect(lifecycle).not.toHaveProperty("resetApplicationStateForProjectSwitch");
    const openSrc = readFileSync(
      join(import.meta.dirname, "../../src/renderer/stores/document-store.ts"),
      "utf-8",
    );
    expect(openSrc).not.toContain("resetApplicationStateForProjectSwitch");
    expect(openSrc).not.toContain("members.length - 1");
    expect(openSrc).toContain("focusPathAfterOpenFolder");
  });

  it("focus change does not dispose agents, clear chats, or stop experiments", async () => {
    await applyWorkbenchFocusChange();
    expect(agentDispose).not.toHaveBeenCalled();
    expect(executionApplyProjectSwitch).not.toHaveBeenCalled();
    expect(terminalDestroyAllAiPty).not.toHaveBeenCalled();
  });

  it("keeps document-store file-tree writes and routes neighbor refresh through switchWorkbenchFocus", () => {
    const openSrc = readFileSync(
      join(import.meta.dirname, "../../src/renderer/stores/document-store.ts"),
      "utf-8",
    );
    expect(openSrc).toContain("switchWorkbenchFocus");
    expect(openSrc).toContain("applyDocumentTree");
    expect(openSrc).not.toContain("reloadCommands");
    expect(openSrc).not.toContain("literature-store");
    expect(openSrc).not.toContain("gitWarmup");
  });
});

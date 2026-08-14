import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalExecutionEvent } from "../../src/shared/execution";

const electronAPI = {
  executionGet: vi.fn(),
  executionReplay: vi.fn(),
  executionCancel: vi.fn(),
  executionRerun: vi.fn(),
  executionFindByToolCallId: vi.fn(),
  onExecutionEvent: vi.fn(() => () => {}),
};

vi.stubGlobal("window", { electronAPI });

import { useExecutionStore } from "../../src/renderer/stores/execution-store";

function output(sequence: number, data: string, executionId = "exec-1"): TerminalExecutionEvent {
  return {
    executionId,
    sequence,
    type: "output",
    at: sequence,
    data,
  };
}

describe("execution-store", () => {
  beforeEach(() => {
    useExecutionStore.getState().reset();
  });

  it("deduplicates replayed and live events by sequence", () => {
    useExecutionStore.getState().applyEvents("exec-1", [
      output(1, "one"),
      output(2, "two"),
    ]);
    useExecutionStore.getState().applyEvent(output(2, "two"));
    expect(useExecutionStore.getState().byId["exec-1"]?.tail).toBe("onetwo");
    expect(useExecutionStore.getState().byId["exec-1"]?.lastSequence).toBe(2);
  });

  it("lists agent-bash executions for one chat in created order", () => {
    useExecutionStore.setState({
      byId: {
        "exec-2": {
          lastSequence: 1,
          tail: "two\n",
          replaying: false,
          summary: {
            executionId: "exec-2",
            origin: "agent-bash",
            state: "running",
            command: "echo two",
            cwd: "/tmp",
            projectId: "/tmp",
            createdAt: 2,
            chatTabId: "chat-1",
          },
        },
        "exec-1": {
          lastSequence: 1,
          tail: "one\n",
          replaying: false,
          summary: {
            executionId: "exec-1",
            origin: "agent-bash",
            state: "completed",
            command: "echo one",
            cwd: "/tmp",
            projectId: "/tmp",
            createdAt: 1,
            chatTabId: "chat-1",
          },
        },
        "exec-other": {
          lastSequence: 1,
          tail: "",
          replaying: false,
          summary: {
            executionId: "exec-other",
            origin: "agent-bash",
            state: "running",
            command: "echo other",
            cwd: "/tmp",
            projectId: "/tmp",
            createdAt: 3,
            chatTabId: "chat-2",
          },
        },
        "exec-exp": {
          lastSequence: 1,
          tail: "",
          replaying: false,
          summary: {
            executionId: "exec-exp",
            origin: "experiment-run",
            state: "running",
            command: "python train.py",
            cwd: "/tmp",
            projectId: "/tmp",
            createdAt: 4,
            chatTabId: "chat-1",
          },
        },
      },
    });
    const listed = useExecutionStore.getState().listForChat("chat-1");
    expect(listed.map((view) => view.summary?.executionId)).toEqual(["exec-1", "exec-2"]);
  });

  it("ignores events at or below the replay cursor", () => {
    useExecutionStore.getState().applyEvent(output(3, "three"));
    useExecutionStore.getState().applyEvent(output(1, "one"));
    expect(useExecutionStore.getState().byId["exec-1"]?.tail).toBe("three");
    expect(useExecutionStore.getState().byId["exec-1"]?.lastSequence).toBe(3);
  });

  it("resolves a historical toolCallId via IPC when memory is empty", async () => {
    electronAPI.executionFindByToolCallId.mockReset();
    electronAPI.executionFindByToolCallId.mockResolvedValue({
      ok: true,
      summary: {
        executionId: "exec-hist",
        origin: "agent-bash",
        state: "completed",
        command: "echo hi",
        cwd: "/tmp",
        projectId: "/tmp",
        createdAt: 1,
        toolCallId: "tool-9",
        chatTabId: "chat-1",
      },
    });

    const id = await useExecutionStore.getState().resolveByToolCallId("tool-9");
    expect(id).toBe("exec-hist");
    expect(useExecutionStore.getState().findByToolCallId("tool-9")).toBe("exec-hist");
    expect(useExecutionStore.getState().byId["exec-hist"]?.summary?.command).toBe("echo hi");
  });
});

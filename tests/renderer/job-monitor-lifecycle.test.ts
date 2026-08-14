import { beforeEach, describe, expect, it, vi } from "vitest";

const executionCancel = vi.fn();

vi.stubGlobal("window", {
  electronAPI: {
    executionCancel,
  },
});

import { useExecutionStore } from "../../src/renderer/stores/execution-store";
import { useRightPanelStore } from "../../src/renderer/stores/right-panel-store";
import { useSettingsStore } from "../../src/renderer/stores/settings-store";
import type { TerminalExecutionSummary } from "../../src/shared/execution";

const agentSummary: TerminalExecutionSummary = {
  executionId: "exec-bash-2",
  origin: "agent-bash",
  state: "running",
  command: "echo two",
  cwd: "/tmp",
  projectId: "/tmp",
  createdAt: 2,
  chatTabId: "chat-1",
};

describe("job monitor lifecycle", () => {
  beforeEach(() => {
    executionCancel.mockReset();
    useExecutionStore.getState().reset();
    useRightPanelStore.setState({ tabs: [], activeTabId: null });
    useSettingsStore.setState((s) => ({
      settings: {
        ...s.settings,
        jobMonitorAutoOpen: true,
        aiTerminalAutoOpen: true,
      },
    }));
  });

  it("does not auto-open after the user dismissed a monitor for that chat", () => {
    useExecutionStore.getState().markMonitorDismissed("chat-1");
    useExecutionStore.getState().onExecutionCreated(agentSummary);
    expect(
      useRightPanelStore.getState().tabs.some((tab) => tab.linkedExecutionId === "exec-bash-2"),
    ).toBe(false);
  });

  it("auto-opens a job monitor for a new agent-bash execution", () => {
    useExecutionStore.getState().onExecutionCreated(agentSummary);
    const tabs = useRightPanelStore
      .getState()
      .tabs.filter((tab) => tab.linkedExecutionId === "exec-bash-2");
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.terminalSource).toBe("job-monitor");
  });

  it("reuses one job monitor tab for later bash in the same chat", () => {
    useExecutionStore.setState({
      byId: {
        "exec-bash-1": {
          lastSequence: 1,
          tail: "one\n",
          replaying: false,
          summary: {
            executionId: "exec-bash-1",
            origin: "agent-bash",
            state: "completed",
            command: "echo one",
            cwd: "/tmp",
            projectId: "/tmp",
            createdAt: 1,
            chatTabId: "chat-1",
          },
        },
        "exec-bash-2": {
          lastSequence: 1,
          tail: "",
          replaying: false,
          summary: agentSummary,
        },
      },
    });
    const first = useRightPanelStore.getState().openJobMonitor("exec-bash-1");
    const second = useRightPanelStore.getState().openJobMonitor("exec-bash-2");
    expect(second).toBe(first);
    const monitors = useRightPanelStore
      .getState()
      .tabs.filter((tab) => tab.terminalSource === "job-monitor");
    expect(monitors).toHaveLength(1);
    expect(monitors[0]?.linkedChatTabId).toBe("chat-1");
    expect(monitors[0]?.linkedExecutionId).toBe("exec-bash-2");
  });

  it("opens a separate monitor for bash in a different chat", () => {
    useExecutionStore.setState({
      byId: {
        "exec-a": {
          lastSequence: 1,
          tail: "",
          replaying: false,
          summary: {
            executionId: "exec-a",
            origin: "agent-bash",
            state: "running",
            command: "echo a",
            cwd: "/tmp",
            projectId: "/tmp",
            createdAt: 1,
            chatTabId: "chat-a",
          },
        },
        "exec-b": {
          lastSequence: 1,
          tail: "",
          replaying: false,
          summary: {
            executionId: "exec-b",
            origin: "agent-bash",
            state: "running",
            command: "echo b",
            cwd: "/tmp",
            projectId: "/tmp",
            createdAt: 2,
            chatTabId: "chat-b",
          },
        },
      },
    });
    const a = useRightPanelStore.getState().openJobMonitor("exec-a");
    const b = useRightPanelStore.getState().openJobMonitor("exec-b");
    expect(b).not.toBe(a);
    expect(useRightPanelStore.getState().tabs.filter((tab) => tab.terminalSource === "job-monitor")).toHaveLength(2);
  });

  it("does not fold an experiment run into the chat monitor", () => {
    useExecutionStore.setState({
      byId: {
        "exec-bash": {
          lastSequence: 1,
          tail: "",
          replaying: false,
          summary: {
            executionId: "exec-bash",
            origin: "agent-bash",
            state: "running",
            command: "echo hi",
            cwd: "/tmp",
            projectId: "/tmp",
            createdAt: 1,
            chatTabId: "chat-1",
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
            cwd: "/tmp/exp",
            projectId: "/tmp",
            createdAt: 2,
            chatTabId: "chat-1",
            experimentId: "exp-1",
            runId: "run-1",
          },
        },
      },
    });
    const bash = useRightPanelStore.getState().openJobMonitor("exec-bash");
    const exp = useRightPanelStore.getState().openJobMonitor("exec-exp");
    expect(exp).not.toBe(bash);
    expect(useRightPanelStore.getState().tabs.filter((tab) => tab.terminalSource === "job-monitor")).toHaveLength(2);
  });

  it("explicit openJobMonitor clears dismissed so later jobs can auto-open", () => {
    useExecutionStore.setState({
      byId: {
        "exec-bash-1": {
          lastSequence: 1,
          tail: "",
          replaying: false,
          summary: {
            executionId: "exec-bash-1",
            origin: "agent-bash",
            state: "completed",
            command: "echo one",
            cwd: "/tmp",
            projectId: "/tmp",
            createdAt: 1,
            chatTabId: "chat-1",
          },
        },
      },
    });
    useExecutionStore.getState().markMonitorDismissed("chat-1");
    useRightPanelStore.getState().openJobMonitor("exec-bash-1");
    expect(useExecutionStore.getState().isMonitorDismissed("chat-1")).toBe(false);
    useExecutionStore.getState().onExecutionCreated(agentSummary);
    expect(
      useRightPanelStore.getState().tabs.some((tab) => tab.linkedExecutionId === "exec-bash-2"),
    ).toBe(true);
  });

  it("cancels only agent-bash executions when a chat closes", async () => {
    useExecutionStore.setState({
      byId: {
        "exec-bash": {
          lastSequence: 1,
          tail: "",
          replaying: false,
          summary: {
            executionId: "exec-bash",
            origin: "agent-bash",
            state: "running",
            command: "sleep 30",
            cwd: "/tmp",
            projectId: "/tmp",
            createdAt: 1,
            chatTabId: "chat-1",
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
            cwd: "/tmp/exp",
            projectId: "/tmp",
            createdAt: 1,
            chatTabId: "chat-1",
            experimentId: "exp-1",
            runId: "run-1",
          },
        },
      },
    });

    await useExecutionStore.getState().cancelForChat("chat-1");

    expect(executionCancel).toHaveBeenCalledWith("exec-bash");
    expect(executionCancel).not.toHaveBeenCalledWith("exec-exp");
  });

  it("closing a job monitor marks that chat dismissed", () => {
    useExecutionStore.setState({
      byId: {
        "exec-bash-2": {
          lastSequence: 1,
          tail: "",
          replaying: false,
          summary: agentSummary,
        },
      },
    });
    const tabId = useRightPanelStore.getState().openJobMonitor("exec-bash-2");
    useRightPanelStore.getState().closeAiTab(tabId);
    expect(useExecutionStore.getState().isMonitorDismissed("chat-1")).toBe(true);
  });
});

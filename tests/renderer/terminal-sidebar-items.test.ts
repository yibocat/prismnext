import { beforeEach, describe, expect, it } from "vitest";
import type { RightTab } from "../../src/renderer/lib/workspace/mode-registry";
import { useRightPanelStore } from "../../src/renderer/stores/right-panel-store";
import { useExecutionStore } from "../../src/renderer/stores/execution-store";
import { useTerminalStore } from "../../src/renderer/stores/terminal-store";
import {
  collectTerminalSidebarJobItems,
  collectTerminalSidebarUserItems,
} from "../../src/renderer/lib/terminal/terminal-sidebar-items";

function terminalTab(partial: Partial<RightTab> & Pick<RightTab, "id" | "title">): RightTab {
  return {
    kind: "terminal",
    isInitial: false,
    ...partial,
  };
}

describe("terminal sidebar items", () => {
  beforeEach(() => {
    useRightPanelStore.setState({ tabs: [], activeTabId: null });
    useExecutionStore.getState().reset();
    useTerminalStore.setState({ sessions: {} });
  });

  it("lists job-monitor tabs and treats legacy ai tabs as monitors", () => {
    useRightPanelStore.setState({
      tabs: [
        terminalTab({ id: "user-1", title: "zsh", terminalSource: "user" }),
        terminalTab({
          id: "job-1",
          title: "echo hi",
          terminalSource: "job-monitor",
          linkedExecutionId: "exec-1",
        }),
        terminalTab({
          id: "legacy-ai",
          title: "AI · Chat",
          terminalSource: "ai",
          linkedChatTabId: "chat-1",
          linkedExecutionId: "exec-2",
        }),
      ],
      activeTabId: "job-1",
    });
    useExecutionStore.setState({
      byId: {
        "exec-1": {
          lastSequence: 1,
          tail: "",
          replaying: false,
          summary: {
            executionId: "exec-1",
            origin: "agent-bash",
            state: "running",
            command: "echo hi",
            cwd: "/tmp",
            projectId: "/tmp",
            createdAt: 1,
          },
        },
        "exec-2": {
          lastSequence: 1,
          tail: "",
          replaying: false,
          summary: {
            executionId: "exec-2",
            origin: "experiment-run",
            state: "completed",
            command: "python train.py",
            cwd: "/tmp/exp",
            projectId: "/tmp",
            createdAt: 1,
          },
        },
      },
    });

    const jobs = collectTerminalSidebarJobItems("job-1");
    expect(jobs.map((item) => item.executionId).sort()).toEqual(["exec-1", "exec-2"]);
    expect(jobs.find((item) => item.executionId === "exec-1")?.isActiveTab).toBe(true);

    const users = collectTerminalSidebarUserItems("job-1");
    expect(users.map((item) => item.tabId)).toEqual(["user-1"]);
  });

  it("openJobMonitor reuses one tab per execution and never creates ai tabs", () => {
    const first = useRightPanelStore.getState().openJobMonitor("exec-1");
    const again = useRightPanelStore.getState().openJobMonitor("exec-1");
    expect(again).toBe(first);
    const tabs = useRightPanelStore.getState().tabs.filter((tab) => tab.linkedExecutionId === "exec-1");
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.terminalSource).toBe("job-monitor");
    expect(useRightPanelStore.getState().tabs.some((tab) => tab.terminalSource === "ai")).toBe(false);
  });

  it("lists one sidebar item for a chat that already has a monitor tab", () => {
    useRightPanelStore.setState({
      tabs: [
        terminalTab({
          id: "job-chat",
          title: "AI",
          terminalSource: "job-monitor",
          linkedChatTabId: "chat-1",
          linkedExecutionId: "exec-2",
        }),
      ],
      activeTabId: "job-chat",
    });
    useExecutionStore.setState({
      byId: {
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
        "exec-2": {
          lastSequence: 1,
          tail: "",
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
      },
    });
    const jobs = collectTerminalSidebarJobItems("job-chat");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.tabId).toBe("job-chat");
    expect(jobs[0]?.state).toBe("running");
  });

  it("lists running executions that do not yet have a monitor tab", () => {
    useExecutionStore.setState({
      byId: {
        "exec-bg": {
          lastSequence: 1,
          tail: "",
          replaying: false,
          summary: {
            executionId: "exec-bg",
            origin: "experiment-run",
            state: "running",
            command: "python train.py",
            cwd: "/tmp/exp",
            projectId: "/tmp",
            createdAt: 1,
          },
        },
      },
    });
    const jobs = collectTerminalSidebarJobItems(null);
    expect(jobs.map((item) => item.executionId)).toEqual(["exec-bg"]);
    expect(jobs[0]?.tabId).toBeUndefined();
  });
});

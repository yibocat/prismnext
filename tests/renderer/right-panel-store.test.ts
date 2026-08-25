import { beforeEach, describe, expect, it, vi } from "vitest";

const executionCancel = vi.fn();

vi.stubGlobal("window", {
  electronAPI: {
    executionCancel,
    agentCancel: vi.fn(),
  },
});

import { useRightPanelStore } from "../../src/renderer/stores/right-panel-store";
import { useExecutionStore } from "../../src/renderer/stores/execution-store";
import { useSettingsStore } from "../../src/renderer/stores/settings-store";

describe("right-panel job monitor close", () => {
  beforeEach(() => {
    executionCancel.mockReset();
    useRightPanelStore.setState({ tabs: [], activeTabId: null });
    useExecutionStore.getState().reset();
    useSettingsStore.setState((s) => ({
      settings: {
        ...s.settings,
        jobMonitorCloseCancels: false,
        aiTerminalCloseTabKillsProcess: false,
      },
    }));
  });

  it("detaches a monitor without cancelling its execution", () => {
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
            command: "sleep 30",
            cwd: "/tmp",
            projectId: "/tmp",
            createdAt: 1,
            chatTabId: "chat-1",
          },
        },
      },
    });
    const tabId = useRightPanelStore.getState().openJobMonitor("exec-1");
    useRightPanelStore.getState().closeAiTab(tabId);

    expect(useRightPanelStore.getState().tabs.find((tab) => tab.id === tabId)).toBeUndefined();
    expect(executionCancel).not.toHaveBeenCalled();
    expect(useExecutionStore.getState().byId["exec-1"]?.summary?.state).toBe("running");
  });
});

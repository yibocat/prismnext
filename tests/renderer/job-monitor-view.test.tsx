import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { TerminalExecutionEvent, TerminalExecutionSummary } from "../../src/shared/execution";

const electronAPI = {
  executionReplay: vi.fn(),
  executionGet: vi.fn(),
  executionCancel: vi.fn(),
  onExecutionEvent: vi.fn(() => () => {}),
};

Object.assign(window, { electronAPI });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { useExecutionStore } from "../../src/renderer/stores/execution-store";
import { useRightPanelStore } from "../../src/renderer/stores/right-panel-store";
import {
  JobMonitorView,
  resolveJobMonitorCopyText,
} from "../../src/renderer/modes/terminal-mode/job-monitor-view";

function output(executionId: string, sequence: number, data: string): TerminalExecutionEvent {
  return { executionId, sequence, type: "output", at: sequence, data };
}

const summary: TerminalExecutionSummary = {
  executionId: "exec-1",
  origin: "agent-bash",
  state: "running",
  command: "echo hi",
  cwd: "/tmp/lab",
  projectId: "/tmp",
  createdAt: 1,
};

describe("JobMonitorView", () => {
  beforeEach(() => {
    useExecutionStore.getState().reset();
    useRightPanelStore.setState({ tabs: [], activeTabId: null });
    electronAPI.executionReplay.mockReset();
    electronAPI.executionReplay.mockResolvedValue({
      ok: true,
      summary,
      events: [output("exec-1", 1, "before attach")],
    });
  });

  it("shows every bash command from the same chat in one monitor", async () => {
    electronAPI.executionReplay.mockImplementation(async ({ executionId }: { executionId: string }) => ({
      ok: true,
      summary: {
        ...summary,
        executionId,
        command: executionId === "exec-1" ? "echo one" : "echo two",
        chatTabId: "chat-1",
        createdAt: executionId === "exec-1" ? 1 : 2,
        state: executionId === "exec-1" ? "completed" : "running",
      },
      events: [output(executionId, 1, executionId === "exec-1" ? "one\n" : "two\n")],
    }));
    useRightPanelStore.setState({
      tabs: [{
        id: "job-tab",
        kind: "terminal",
        title: "AI",
        isInitial: false,
        terminalSource: "job-monitor",
        linkedChatTabId: "chat-1",
        linkedExecutionId: "exec-2",
      }],
      activeTabId: "job-tab",
    });
    useExecutionStore.setState({
      byId: {
        "exec-1": {
          lastSequence: 1,
          tail: "one\n",
          replaying: false,
          summary: {
            ...summary,
            executionId: "exec-1",
            command: "echo one",
            state: "completed",
            chatTabId: "chat-1",
            createdAt: 1,
          },
        },
        "exec-2": {
          lastSequence: 1,
          tail: "two\n",
          replaying: false,
          summary: {
            ...summary,
            executionId: "exec-2",
            command: "echo two",
            state: "running",
            chatTabId: "chat-1",
            createdAt: 2,
          },
        },
      },
    });
    render(<JobMonitorView tabId="job-tab" executionId="exec-2" />);
    expect(await screen.findByText(/\$ echo one/)).toBeTruthy();
    expect(screen.getByText(/\$ echo two/)).toBeTruthy();
    expect(screen.getByText(/one/)).toBeTruthy();
    expect(screen.getByText(/two/)).toBeTruthy();
  });

  it("replays then follows the attached execution", async () => {
    render(<JobMonitorView tabId="job-tab" executionId="exec-1" />);
    await waitFor(() => expect(screen.getByText("before attach")).toBeTruthy());
    useExecutionStore.getState().applyEvent(output("exec-1", 3, "after attach"));
    expect(await screen.findByText(/after attach/)).toBeTruthy();
  });

  it("does not render a second action toolbar inside the monitor", async () => {
    render(<JobMonitorView tabId="job-tab" executionId="exec-1" />);
    await waitFor(() => expect(screen.getByText("before attach")).toBeTruthy());
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTestId("job-monitor-transcript")).toBeTruthy();
  });

  it("copies the visible transcript, not an empty tail", () => {
    const byId = {
      "exec-1": {
        lastSequence: 1,
        tail: "hello from the job\n",
        replaying: false,
        summary: {
          ...summary,
          command: "echo hello",
          chatTabId: "chat-1",
        },
      },
    };
    const text = resolveJobMonitorCopyText({
      linkedChatTabId: "chat-1",
      linkedExecutionId: "exec-1",
      byId,
      listForChat: () => [byId["exec-1"]],
    });
    expect(text).toContain("$ echo hello");
    expect(text).toContain("hello from the job");
  });
});

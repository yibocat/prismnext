import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ContentBlock } from "../../src/renderer/stores/chat-store";

const openJobMonitor = vi.fn();
const focusLiveAiTerminal = vi.fn();
const openBashInTerminal = vi.fn();

vi.mock("../../src/renderer/stores/right-panel-store", () => ({
  useRightPanelStore: {
    getState: () => ({ openJobMonitor }),
  },
}));

vi.mock("../../src/renderer/stores/chat-store", () => ({
  useChatStore: (sel: (s: { activeTabId: string }) => unknown) => sel({ activeTabId: "chat-1" }),
}));

vi.mock("../../src/renderer/stores/terminal-ai-store", () => ({
  useTerminalAiStore: Object.assign(
    (sel: (s: { bashByToolCall: Record<string, { status: string }> }) => unknown) =>
      sel({ bashByToolCall: { "tool-1": { status: "running" } } }),
    {
      getState: () => ({ focusLiveAiTerminal, openBashInTerminal }),
    },
  ),
}));

vi.mock("../../src/renderer/stores/execution-store", () => ({
  useExecutionStore: {
    getState: () => ({
      findByToolCallId: (toolCallId: string) => (toolCallId === "tool-1" ? "exec-bash-1" : undefined),
      resolveByToolCallId: async (toolCallId: string) =>
        (toolCallId === "tool-1" ? "exec-bash-1" : undefined),
    }),
  },
}));

vi.mock("../../src/renderer/components/modules/chat/tools/use-tool-permission", () => ({
  useToolPermission: () => ({ isAwaitingPermission: false, isToolDenied: false }),
}));

import { BashWidget } from "../../src/renderer/components/modules/chat/tools/bash-widget";

describe("BashWidget job monitor action", () => {
  beforeEach(() => {
    openJobMonitor.mockReset();
    focusLiveAiTerminal.mockReset();
    openBashInTerminal.mockReset();
  });

  it("shows what the command is doing on the row, not the raw command", () => {
    const command = "i=1; while true; do echo tick-$i; i=$((i+1)); sleep 1; done";
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tool-1",
      name: "bash",
      input: { command, description: "Print ticks every second" },
    };
    const toolResult: ContentBlock = {
      type: "tool_result",
      content: { output: "tick-1\n", exitCode: 0 },
    };

    render(<BashWidget toolUse={toolUse} toolResult={toolResult} toolName="bash" />);

    expect(screen.getByText("Print ticks every second")).toBeTruthy();
    expect(screen.queryByText(command)).toBeNull();
    expect(screen.queryByTestId("bash-command-scroll")).toBeNull();
  });

  it("opens one panel with the command then the output, and no extra expand controls", () => {
    const command = "i=1; while true; do echo tick-$i; i=$((i+1)); sleep 1; done";
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tool-1",
      name: "bash",
      input: { command, description: "Print ticks every second" },
    };
    const toolResult: ContentBlock = {
      type: "tool_result",
      content: { output: "tick-1\n", exitCode: 0 },
    };

    render(<BashWidget toolUse={toolUse} toolResult={toolResult} toolName="bash" />);
    fireEvent.click(screen.getByText("Print ticks every second"));

    const panel = screen.getByTestId("bash-panel");
    expect(panel.textContent).toContain(command);
    expect(panel.textContent).toContain("tick-1");
    expect(screen.queryByRole("button", { name: /expand command|展开命令/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /expand output|展开输出/i })).toBeNull();
  });

  it("shows the command in the dropdown while the job is still running", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tool-1",
      name: "bash",
      input: { command: "sleep 30", description: "Wait half a minute" },
    };

    render(<BashWidget toolUse={toolUse} toolName="bash" />);

    expect(screen.getByText("Wait half a minute")).toBeTruthy();
    expect(screen.getByTestId("bash-command-scroll").textContent).toContain("sleep 30");
    expect(screen.getByText("Running…")).toBeTruthy();
    expect(screen.queryByText("exit 0")).toBeNull();
  });

  it("shows command then result after the job finishes", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tool-1",
      name: "bash",
      input: { command: "echo hi", description: "Print a greeting" },
    };
    const toolResult: ContentBlock = {
      type: "tool_result",
      content: { output: "hi\n", exitCode: 0 },
    };

    render(<BashWidget toolUse={toolUse} toolResult={toolResult} toolName="bash" />);
    fireEvent.click(screen.getByText("Print a greeting"));

    expect(screen.getByTestId("bash-command-scroll").textContent).toContain("echo hi");
    expect(screen.getByTestId("bash-command-scroll").querySelector(".shiki-wrapper")).toBeTruthy();
    expect(screen.getByText("hi")).toBeTruthy();
    expect(screen.getByText("hi").closest(".shiki-wrapper")).toBeNull();
  });

  it("keeps the opened panel height-capped so long output scrolls inside it", () => {
    const output = Array.from({ length: 20 }, (_, i) => `line-${i}`).join("\n");
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tool-1",
      name: "bash",
      input: { command: "seq 20", description: "Count to twenty" },
    };
    const toolResult: ContentBlock = {
      type: "tool_result",
      content: { output, exitCode: 0 },
    };

    render(<BashWidget toolUse={toolUse} toolResult={toolResult} toolName="bash" />);
    fireEvent.click(screen.getByText("Count to twenty"));

    expect(screen.getByTestId("bash-panel").className).toContain("max-h-72");
    expect(screen.queryByRole("button", { name: /expand output|展开输出/i })).toBeNull();
  });

  it("opens the job monitor instead of the AI mirror tab", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tool-1",
      name: "bash",
      input: { command: "echo hi" },
    };

    render(<BashWidget toolUse={toolUse} toolName="bash" />);
    fireEvent.click(screen.getByText("Monitor"));

    expect(openJobMonitor).toHaveBeenCalledWith("exec-bash-1");
    expect(focusLiveAiTerminal).not.toHaveBeenCalled();
    expect(openBashInTerminal).not.toHaveBeenCalled();
  });

  it("opens a historical job from the tool result executionId", async () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tool-old",
      name: "bash",
      input: { command: "echo hi", description: "Print a greeting" },
    };
    const toolResult: ContentBlock = {
      type: "tool_result",
      content: { output: "hi\n", exitCode: 0, executionId: "exec-hist" },
    };

    render(<BashWidget toolUse={toolUse} toolResult={toolResult} toolName="bash" />);
    fireEvent.click(screen.getByText("Monitor"));

    expect(openJobMonitor).toHaveBeenCalledWith("exec-hist");
  });
});

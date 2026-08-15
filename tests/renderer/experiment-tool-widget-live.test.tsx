import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ExperimentToolWidget } from "../../src/renderer/components/modules/chat/tools/experiment-tool-widget";
import type { ContentBlock } from "../../src/renderer/stores/chat-store";

const openExperimentInPanel = vi.fn();
const openJobMonitor = vi.fn();

vi.mock("../../src/renderer/modes/experiments-mode/open-experiment", () => ({
  openExperimentInPanel: (...args: unknown[]) => openExperimentInPanel(...args),
  resolveExperimentIdFromTool: (
    input: Record<string, unknown>,
    _data: Record<string, unknown> | null,
  ) => (typeof input.id === "string" ? input.id : null),
}));

vi.mock("../../src/renderer/stores/right-panel-store", () => ({
  useRightPanelStore: {
    getState: () => ({ openJobMonitor }),
  },
}));

vi.mock("../../src/renderer/stores/experiment-store", () => ({
  useExperimentStore: (sel: (s: {
    runInFlight: {
      id: string;
      runId: string;
      command: string;
      liveOutput: string;
      executionId?: string;
    } | null;
  }) => unknown) =>
    sel({
      runInFlight: {
        id: "exp-live",
        runId: "run-1",
        command: "python train.py",
        liveOutput: "epoch 1 loss=0.4\nepoch 2 loss=0.3\n",
        executionId: "exec-exp-1",
      },
    }),
}));

describe("ExperimentToolWidget live run", () => {
  it("shows live tail and Live open affordance while experiment-run is in flight", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tu-1",
      name: "experiment-run",
      input: { id: "exp-live", command: "python train.py" },
    };

    render(
      <ExperimentToolWidget
        toolUse={toolUse}
        toolName="experiment-run"
      />,
    );

    expect(screen.getByText("Running")).toBeTruthy();
    expect(screen.getByText("exp-live")).toBeTruthy();
    expect(screen.getByText("Monitor")).toBeTruthy();
    expect(screen.getByText("Streaming output…")).toBeTruthy();
    const terminal = screen.getByTestId("experiment-run-terminal");
    expect(terminal.textContent).toContain("$ python train.py");
    expect(terminal.textContent).toContain("epoch 2 loss=0.3");
  });

  it("opens the job monitor for the live execution", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tu-1",
      name: "experiment-run",
      input: { id: "exp-live", command: "python train.py" },
    };

    render(
      <ExperimentToolWidget
        toolUse={toolUse}
        toolName="experiment-run"
      />,
    );

    fireEvent.click(screen.getByText("Monitor"));
    expect(openJobMonitor).toHaveBeenCalledWith("exec-exp-1");
    expect(openExperimentInPanel).not.toHaveBeenCalled();
  });
});

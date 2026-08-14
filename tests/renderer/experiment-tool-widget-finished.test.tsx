import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ExperimentToolWidget } from "../../src/renderer/components/modules/chat/tools/experiment-tool-widget";
import type { ContentBlock } from "../../src/renderer/stores/chat-store";

const openExperimentInPanel = vi.fn();

vi.mock("../../src/renderer/modes/experiments-mode/open-experiment", () => ({
  openExperimentInPanel: (...args: unknown[]) => openExperimentInPanel(...args),
  resolveExperimentIdFromTool: (
    input: Record<string, unknown>,
    _data: Record<string, unknown> | null,
  ) => (typeof input.id === "string" ? input.id : null),
}));

vi.mock("../../src/renderer/stores/experiment-store", () => ({
  useExperimentStore: (sel: (s: { runInFlight: null }) => unknown) =>
    sel({ runInFlight: null }),
}));

describe("ExperimentToolWidget finished run", () => {
  it("shows a compact narrative card, not raw run-id / ISO timestamps", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tu-1",
      name: "experiment-run",
      input: {
        id: "exp-live",
        command: 'python -u -c "import time; print(1)"',
      },
    };
    const toolResult: ContentBlock = {
      type: "tool_result",
      tool_use_id: "tu-1",
      content: JSON.stringify({
        ok: true,
        exitCode: 0,
        run: {
          runId: "run-20260726-033427-cdb0",
          command: 'python -u -c "import time; print(1)"',
          startedAt: "2026-07-26T03:34:27.200Z",
          finishedAt: "2026-07-26T03:34:28.400Z",
          exitCode: 0,
          cwd: "experiment/exp-live",
          stdoutTail: "epoch 0 loss=1.000\nepoch 9 loss=0.100\n",
          logPath: "logs/run-20260726-033427-cdb0.log",
        },
      }),
    };

    render(
      <ExperimentToolWidget
        toolUse={toolUse}
        toolResult={toolResult}
        toolName="experiment-run"
      />,
    );

    expect(screen.getByText("Succeeded")).toBeTruthy();
    expect(screen.getByText(/1s/)).toBeTruthy();
    expect(screen.getByText("exp-live")).toBeTruthy();
    expect(screen.queryByText(/python -u -c/)).toBeNull();
    expect(screen.queryByText("run-20260726-033427-cdb0")).toBeNull();
    expect(screen.queryByText(/2026-07-26T03:34:27/)).toBeNull();

    fireEvent.click(screen.getByText("exp-live"));
    const terminal = screen.getByTestId("experiment-run-terminal");
    expect(terminal.textContent).toContain('python -u -c "import time; print(1)"');
    expect(terminal.textContent).toContain("epoch 9 loss=0.100");
    expect(screen.getByText("Details")).toBeTruthy();

    fireEvent.click(screen.getByText("Details"));
    expect(screen.getByText("run-20260726-033427-cdb0")).toBeTruthy();
  });
});

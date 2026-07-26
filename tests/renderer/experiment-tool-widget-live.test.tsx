import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
  useExperimentStore: (sel: (s: {
    runInFlight: {
      id: string;
      runId: string;
      command: string;
      liveOutput: string;
    } | null;
  }) => unknown) =>
    sel({
      runInFlight: {
        id: "exp-live",
        runId: "run-1",
        command: "python train.py",
        liveOutput: "epoch 1 loss=0.4\nepoch 2 loss=0.3\n",
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
    expect(screen.getByText(/epoch 2 loss=0.3/)).toBeTruthy();
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.getByText("Streaming output…")).toBeTruthy();
  });
});

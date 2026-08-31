import { afterEach, describe, expect, it, vi } from "vitest";
import { setHostEventsForTest } from "../../src/main/app/event-sink";
import { notifyAgentCompilePreview } from "../../src/main/compile/compile-preview-notify";

describe("notifyAgentCompilePreview", () => {
  afterEach(() => setHostEventsForTest(null));

  it("broadcasts artifact key fields alongside legacy aliases", () => {
    const broadcast = vi.fn();
    setHostEventsForTest({
      broadcast,
      sendToOriginThenBroadcast: vi.fn(),
    });
    notifyAgentCompilePreview({
      projectDir: "/p",
      projectRoot: "/p",
      engine: "latex",
      route: "paper",
      compileRoot: "manuscript/main.tex",
      pdfRel: ".workbench/compile/latex/main.pdf",
      success: true,
      source: "agent",
      mainFile: "manuscript/main.tex",
    });
    expect(broadcast).toHaveBeenCalledWith(
      "compile:agentComplete",
      expect.objectContaining({
        projectDir: "/p",
        projectRoot: "/p",
        engine: "latex",
        route: "paper",
        compileRoot: "manuscript/main.tex",
        pdfRel: ".workbench/compile/latex/main.pdf",
        source: "agent",
        mainFile: "manuscript/main.tex",
        success: true,
      }),
    );
  });
});

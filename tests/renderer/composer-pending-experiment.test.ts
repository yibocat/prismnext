import { describe, expect, it } from "vitest";
import type { ContentBlock } from "../../src/renderer/stores/chat-store";
import {
  findComposerPendingExperimentRun,
  selectComposerHostedExperimentRunId,
} from "../../src/renderer/lib/chat/composer-pending-experiment";

function assistantMsg(blocks: ContentBlock[]) {
  return { type: "assistant" as const, message: { content: blocks } };
}

function userMsg(text: string) {
  return { type: "user" as const, message: { content: [{ type: "text" as const, text }] } };
}

describe("composer-pending-experiment", () => {
  it("finds experiment-run in active turn", () => {
    const messages = [
      userMsg("run it"),
      assistantMsg([
        {
          type: "tool_use",
          id: "exp-1",
          name: "experiment-run",
          input: { experimentId: "iso-1", command: "python train.py" },
        },
      ]),
    ];
    const pending = findComposerPendingExperimentRun({
      messages,
      streamingMessage: null,
      isStreaming: true,
      chromeLive: true,
    });
    expect(pending?.toolUse.id).toBe("exp-1");
    expect(pending?.experimentId).toBe("iso-1");
  });

  it("hides when chrome is suppressed", () => {
    const messages = [
      userMsg("run it"),
      assistantMsg([
        {
          type: "tool_use",
          id: "exp-1",
          name: "experiment-run",
          input: { experimentId: "iso-1", command: "python train.py" },
        },
      ]),
    ];
    expect(
      selectComposerHostedExperimentRunId({
        activeTabId: "tab-1",
        tabs: [{
          id: "tab-1",
          messages,
          streamingMessage: null,
          isStreaming: true,
          composerToolsSuppressed: true,
        }],
      }),
    ).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import {
  buildToolResultMap,
  createToolResultFromState,
} from "../../src/renderer/components/modules/chat/tools/tool-result-map";
import type { ChatStreamMessage } from "../../src/renderer/stores/chat-store";

describe("tool-result-map", () => {
  it("creates tool_result for cancelled tools without output", () => {
    const result = createToolResultFromState("call-1", "cancelled", null);
    expect(result).toEqual({
      type: "tool_result",
      tool_use_id: "call-1",
      content: "Permission denied",
      is_error: true,
    });
  });

  it("synthesizes orphan tool results when session is not streaming", () => {
    const messages: ChatStreamMessage[] = [
      {
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", id: "call-denied", name: "bash", input: { command: "ls" } },
          ],
        },
      },
    ];

    const map = buildToolResultMap(messages, { isStreaming: false });
    expect(map.get("call-denied")).toEqual({
      type: "tool_result",
      tool_use_id: "call-denied",
      content: "Permission denied",
      is_error: true,
    });
  });

  it("does not synthesize orphan results while streaming", () => {
    const messages: ChatStreamMessage[] = [
      {
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", id: "call-running", name: "read", input: {} },
          ],
        },
      },
    ];

    const map = buildToolResultMap(messages, { isStreaming: true });
    expect(map.has("call-running")).toBe(false);
  });
});

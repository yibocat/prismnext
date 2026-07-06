import { describe, it, expect } from "vitest";
import {
  buildToolResultMap,
  createToolResultFromState,
  isFinalToolStatus,
  normalizeToolStatus,
} from "../../src/renderer/components/modules/chat/tools/tool-result-map";
import type { ChatStreamMessage } from "../../src/renderer/stores/chat-store";

describe("tool-result-map", () => {
  it("creates tool_result for cancelled tools without output (label = Cancelled, not Permission denied)", () => {
    const result = createToolResultFromState("call-1", "cancelled", null);
    expect(result).toEqual({
      type: "tool_result",
      tool_use_id: "call-1",
      content: "Cancelled",
      is_error: true,
    });
  });

  it("labels denied status without output as Permission denied", () => {
    const result = createToolResultFromState("call-2", "denied", null);
    expect(result?.content).toBe("Permission denied");
    expect(result?.is_error).toBe(true);
  });

  it("labels timed_out status without output as Permission timed out", () => {
    const result = createToolResultFromState("call-3", "timed_out", null);
    expect(result?.content).toBe("Permission timed out");
  });

  it("synthesizes orphan tool results with a NEUTRAL label when not streaming", () => {
    const messages: ChatStreamMessage[] = [
      {
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", id: "call-orphan", name: "bash", input: { command: "ls" } },
          ],
        },
      },
    ];

    const map = buildToolResultMap(messages, { isStreaming: false });
    // Orphan must NOT say "Permission denied" — we don't know why the result is
    // missing. Real denies inject their own "Permission denied" result.
    expect(map.get("call-orphan")).toEqual({
      type: "tool_result",
      tool_use_id: "call-orphan",
      content: "No result received",
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

describe("isFinalToolStatus / normalizeToolStatus", () => {
  // Regression: OpenCode's ACP binary emits terminal success as `completed`,
  // `success`, or `finished` (synonyms). The renderer previously accepted only
  // `completed`/`failed` and DROPPED `success`/`finished` results, leaving tools
  // spinning forever → "No result received".
  it("treats success synonyms (completed/success/finished/done) as final", () => {
    expect(isFinalToolStatus("completed")).toBe(true);
    expect(isFinalToolStatus("success")).toBe(true);
    expect(isFinalToolStatus("finished")).toBe(true);
    expect(isFinalToolStatus("done")).toBe(true);
    expect(isFinalToolStatus("failed")).toBe(true);
    expect(isFinalToolStatus("")).toBe(true); // empty = final (matches prior behavior)
  });

  it("treats active statuses (in_progress/running/pending) as NOT final", () => {
    expect(isFinalToolStatus("in_progress")).toBe(false);
    expect(isFinalToolStatus("running")).toBe(false);
    expect(isFinalToolStatus("pending")).toBe(false);
  });

  it("normalizes success synonyms to 'completed' for downstream widgets", () => {
    expect(normalizeToolStatus("success")).toBe("completed");
    expect(normalizeToolStatus("FINISHED")).toBe("completed");
    expect(normalizeToolStatus("done")).toBe("completed");
    expect(normalizeToolStatus("completed")).toBe("completed");
    // non-success statuses pass through unchanged (lowercased)
    expect(normalizeToolStatus("failed")).toBe("failed");
    expect(normalizeToolStatus("")).toBe("");
  });
});

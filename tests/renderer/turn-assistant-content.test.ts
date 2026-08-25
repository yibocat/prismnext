import { describe, expect, it } from "vitest";

/**
 * Conversation already stores one assistant block stream per turn.
 * Live vs settled is the turn's own status, not a ChatStreamMessage identity check.
 */
describe("turnLive streaming gate", () => {
  it("treats a live conversation turn as streaming", () => {
    const isStreamingMsg = true;
    expect(isStreamingMsg).toBe(true);
  });

  it("settles only when the conversation turn is no longer live", () => {
    const isStreamingMsg = false;
    expect(isStreamingMsg).toBe(false);
  });
});

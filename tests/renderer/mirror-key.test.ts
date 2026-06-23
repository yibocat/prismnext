import { describe, expect, it } from "vitest";
import { migrateMirrorLogOnSessionBound } from "../../src/renderer/lib/terminal/mirror-key";

describe("migrateMirrorLogOnSessionBound", () => {
  it("moves provisional chat-tab log to sessionId", () => {
    const next = migrateMirrorLogOnSessionBound(
      { "chat-1": "$ echo hi\nhi\n" },
      "chat-1",
      "sess-abc",
    );
    expect(next["sess-abc"]).toBe("$ echo hi\nhi\n");
    expect(next["chat-1"]).toBeUndefined();
  });

  it("merges longer provisional log into existing session log", () => {
    const next = migrateMirrorLogOnSessionBound(
      {
        "chat-1": "$ echo hi\nhi\nexit 0\n",
        "sess-abc": "$ echo hi\n",
      },
      "chat-1",
      "sess-abc",
    );
    expect(next["sess-abc"]).toContain("exit 0");
    expect(next["chat-1"]).toBeUndefined();
  });

  it("no-op when sessionId equals chatTabId", () => {
    const input = { "chat-1": "log" };
    expect(migrateMirrorLogOnSessionBound(input, "chat-1", "chat-1")).toBe(input);
  });
});

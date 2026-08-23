import { describe, expect, it } from "vitest";
import { generateSessionTitleFromRecord } from "../../src/main/agent/session-title";
import type { AgentSessionRecord } from "../../src/main/agent/session-store";

function record(title: string): AgentSessionRecord {
  return {
    version: 2,
    conversationId: "c1",
    runtimeSessionId: "r1",
    title,
    projectRoot: "/tmp/paper",
    projectId: "p1",
    boundCheckoutPath: "/tmp/paper",
    backend: "pi-sdk",
    permissionMode: "default",
    sessionAgent: "build",
    turns: [{
      turnIndex: 0,
      turnId: "t1",
      createdAt: 1,
      user: { text: "hello there" },
      assistant: { text: "hi", toolCalls: [] },
      status: "completed",
    }],
    createdAt: "1",
    updatedAt: "1",
  };
}

describe("generateSessionTitleFromRecord", () => {
  it("skips when the stored title is already a real name", async () => {
    const result = await generateSessionTitleFromRecord(
      record("Rewrite the intro"),
      { conversationId: "c1", userText: "hello there" },
      {},
    );
    expect(result).toEqual({ ok: true, title: "Rewrite the intro", skipped: true });
  });

  it("fails closed when the provider is not configured", async () => {
    const result = await generateSessionTitleFromRecord(
      record("hello there"),
      { conversationId: "c1", userText: "hello there", assistantText: "hi" },
      {},
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("missing_pi_provider");
  });
});

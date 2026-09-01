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

  it("does not skip when the stored title is the compiled first-send prompt", async () => {
    const compiled = "## Referenced files\n\n```main.tex\n\\section{Intro}\n```";
    const result = await generateSessionTitleFromRecord(
      record(compiled.slice(0, 80)),
      { conversationId: "c1", userText: "请改一下引言", assistantText: "" },
      {},
    );
    expect(result.skipped).not.toBe(true);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("missing_pi_provider");
  });

  it("writes the model title when the completer returns one", async () => {
    const result = await generateSessionTitleFromRecord(
      record("hello there"),
      { conversationId: "c1", userText: "hello there", assistantText: "hi" },
      { aiProvider: "openai", aiModel: "gpt-4.1", aiApiKeys: { openai: "sk-test" } },
      {
        completeTitle: async () => "Fix the abstract",
      },
    );
    expect(result).toEqual({ ok: true, title: "Fix the abstract" });
  });

  it("prefers live auth over settings when completing a title", async () => {
    let seen: { provider: string; model: string } | undefined;
    const result = await generateSessionTitleFromRecord(
      record("New Chat"),
      { conversationId: "c1", userText: "hello there", assistantText: "hi" },
      { aiProvider: "openai", aiModel: "gpt-4.1", aiApiKeys: { openai: "sk-settings" } },
      {
        auth: { provider: "opencode", modelId: "claude-sonnet-4-5", apiKey: "sk-live" },
        completeTitle: async (input) => {
          seen = { provider: input.provider, model: input.model };
          expect(input.apiKey).toBe("sk-live");
          return "Rewrite the intro";
        },
      },
    );
    expect(seen).toEqual({ provider: "opencode", model: "claude-sonnet-4-5" });
    expect(result).toEqual({ ok: true, title: "Rewrite the intro" });
  });
});

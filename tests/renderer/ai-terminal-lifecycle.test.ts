import { describe, expect, it } from "vitest";
import {
  shouldGcAiTerminalTab,
  resolveAiTerminalViewMode,
  type AiTerminalSessionState,
} from "../../src/renderer/lib/terminal/ai-terminal-lifecycle";

function baseState(overrides: Partial<AiTerminalSessionState> = {}): AiTerminalSessionState {
  return {
    sessionId: "sess-1",
    chatTabId: "chat-1",
    phase: "completed",
    exitedAt: 0,
    lastViewedAt: 0,
    aiTabId: "ai-tab-1",
    ...overrides,
  };
}

describe("shouldGcAiTerminalTab", () => {
  const settings = { postExitGraceMs: 60_000, idleCloseMs: 600_000 };
  const now = 1_000_000;

  it("never GCs running sessions", () => {
    expect(
      shouldGcAiTerminalTab(
        baseState({ phase: "running", exitedAt: undefined }),
        now,
        null,
        settings,
      ),
    ).toBe(false);
  });

  it("never GCs the active OpenCode session", () => {
    expect(
      shouldGcAiTerminalTab(
        baseState({
          exitedAt: now - 120_000,
          lastViewedAt: now - 700_000,
        }),
        now,
        "sess-1",
        settings,
      ),
    ).toBe(false);
  });

  it("GCs when grace and idle thresholds are met", () => {
    expect(
      shouldGcAiTerminalTab(
        baseState({
          exitedAt: now - 120_000,
          lastViewedAt: now - 700_000,
        }),
        now,
        "other-session",
        settings,
      ),
    ).toBe(true);
  });

  it("waits for post-exit grace", () => {
    expect(
      shouldGcAiTerminalTab(
        baseState({
          exitedAt: now - 30_000,
          lastViewedAt: now - 700_000,
        }),
        now,
        "other-session",
        settings,
      ),
    ).toBe(false);
  });

  it("respects pinned flag", () => {
    expect(
      shouldGcAiTerminalTab(
        baseState({
          pinned: true,
          exitedAt: now - 120_000,
          lastViewedAt: now - 700_000,
        }),
        now,
        "other-session",
        settings,
      ),
    ).toBe(false);
  });
});

describe("resolveAiTerminalViewMode", () => {
  it("uses live mode only for PTY while running", () => {
    expect(resolveAiTerminalViewMode("pty", "running")).toBe("live");
    expect(resolveAiTerminalViewMode("pty", "completed")).toBe("replay");
    expect(resolveAiTerminalViewMode("pty", "idle")).toBe("replay");
    expect(resolveAiTerminalViewMode("mirror", "running")).toBe("replay");
    expect(resolveAiTerminalViewMode(undefined, "running")).toBe("replay");
  });
});

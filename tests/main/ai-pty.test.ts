import { describe, expect, it, afterEach } from "vitest";
import {
  runAiCommand,
  cancelAiCommandForSession,
  destroyAllAiPty,
  _resetAiPtyForTests,
  _getActiveAiPtyCountForTests,
  _hasActiveAiPtyForSession,
} from "../../src/main/services/ai-pty";

describe("ai-pty", () => {
  afterEach(() => {
    _resetAiPtyForTests();
  });

  it("streams command output chunks", async () => {
    const chunks: string[] = [];
    const result = await runAiCommand({
      command: "echo pty-stream-ok",
      cwd: process.cwd(),
      sessionId: "sess-1",
      chatTabId: "chat-1",
      requestId: "req-1",
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(result.exitCode).toBe(0);
    expect(chunks.join("")).toContain("pty-stream-ok");
    expect(result.output).toContain("pty-stream-ok");
  });

  it("tracks active PTY by sessionId and cancels", async () => {
    const promise = runAiCommand({
      command: "sleep 30",
      cwd: process.cwd(),
      sessionId: "sess-cancel",
      chatTabId: "chat-1",
      requestId: "req-sleep",
      onChunk: () => {},
    });

    await new Promise((r) => setTimeout(r, 80));
    expect(_hasActiveAiPtyForSession("sess-cancel")).toBe(true);
    cancelAiCommandForSession("sess-cancel");
    expect(_getActiveAiPtyCountForTests()).toBe(0);

    await expect(promise).resolves.toMatchObject({ cwd: process.cwd() });
  });

  it("destroyAllAiPty clears in-flight sessions (Bug #6 quit path)", async () => {
    const promise = runAiCommand({
      command: "sleep 30",
      cwd: process.cwd(),
      sessionId: "sess-quit",
      chatTabId: "chat-1",
      requestId: "req-quit",
      onChunk: () => {},
    });

    await new Promise((r) => setTimeout(r, 80));
    expect(_getActiveAiPtyCountForTests()).toBe(1);
    destroyAllAiPty();
    expect(_getActiveAiPtyCountForTests()).toBe(0);
    await expect(promise).resolves.toMatchObject({ cwd: process.cwd() });
  });

  it("cancel settles the promise even if exit is slow (Bug #15)", async () => {
    const promise = runAiCommand({
      command: "sleep 60",
      cwd: process.cwd(),
      sessionId: "sess-settle",
      chatTabId: "chat-1",
      requestId: "req-settle",
      onChunk: () => {},
    });
    await new Promise((r) => setTimeout(r, 80));
    cancelAiCommandForSession("sess-settle");
    // Must resolve via onExit or the 2s force-settle — never hang the test suite.
    await expect(promise).resolves.toMatchObject({ cwd: process.cwd() });
    expect(_getActiveAiPtyCountForTests()).toBe(0);
  }, 10_000);
});

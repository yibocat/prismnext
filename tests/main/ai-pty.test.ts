import { describe, expect, it, afterEach } from "vitest";
import {
  runAiCommand,
  cancelAiCommandForSession,
  destroyAllAiPty,
  _resetAiPtyForTests,
  _getActiveAiPtyCountForTests,
  _hasActiveAiPtyForSession,
} from "../../src/main/services/ai-pty";

async function waitUntil(predicate: () => boolean, message: string, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(message);
}

describe("ai-pty", () => {
  afterEach(() => {
    _resetAiPtyForTests();
  });

  it("runs a one-shot PTY under the test runtime", async () => {
    const result = await runAiCommand({
      command: process.platform === "win32" ? "echo pty-probe" : "printf pty-probe",
      cwd: process.cwd(),
      sessionId: "pty-probe",
      chatTabId: "test",
      requestId: "probe",
      onChunk: () => {},
    });
    expect(result.output).toContain("pty-probe");
    expect(result.exitCode).toBe(0);
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

    await waitUntil(
      () => _hasActiveAiPtyForSession("sess-cancel"),
      "PTY never became active for sess-cancel",
    );
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

    await waitUntil(
      () => _getActiveAiPtyCountForTests() === 1,
      "PTY never became active for sess-quit",
    );
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
    await waitUntil(
      () => _hasActiveAiPtyForSession("sess-settle"),
      "PTY never became active for sess-settle",
    );
    cancelAiCommandForSession("sess-settle");
    // Must resolve via onExit or the 2s force-settle — never hang the test suite.
    await expect(promise).resolves.toMatchObject({ cwd: process.cwd() });
    expect(_getActiveAiPtyCountForTests()).toBe(0);
  }, 10_000);
});

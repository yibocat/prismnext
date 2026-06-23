import { describe, expect, it, afterEach } from "vitest";
import {
  runAiCommand,
  cancelAiCommandForSession,
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
});

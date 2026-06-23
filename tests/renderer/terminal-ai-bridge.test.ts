import { describe, expect, it, beforeEach } from "vitest";
import {
  formatMirrorCommandLine,
  formatMirrorExitFooter,
  truncateTerminalOutput,
} from "../../src/renderer/lib/terminal/ai-mirror";
import {
  handleBashToolUse,
  parseBashResultContent,
} from "../../src/renderer/lib/terminal/ai-bridge";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useRightPanelStore } from "@/stores/right-panel-store";

describe("terminal-ai-mirror", () => {
  it("formats command line without cwd pollution", () => {
    expect(formatMirrorCommandLine("sleep 30")).toContain("sleep 30");
    expect(formatMirrorCommandLine("pnpm test", "/proj")).toContain("pnpm test");
  });

  it("truncates long output", () => {
    const long = "x".repeat(40_000);
    expect(truncateTerminalOutput(long).length).toBeLessThan(long.length);
  });
});

describe("parseBashResultContent", () => {
  it("parses structured bash result", () => {
    const parsed = parseBashResultContent({ output: "ok\n", exitCode: 0, cwd: "/proj" });
    expect(parsed.output).toBe("ok\n");
    expect(parsed.exitCode).toBe(0);
    expect(parsed.cwd).toBe("/proj");
  });

  it("parses string content", () => {
    expect(parseBashResultContent("plain")).toEqual({ output: "plain" });
  });
});

describe("handleBashToolUse", () => {
  beforeEach(() => {
    useTerminalAiStore.getState().reset();
    useRightPanelStore.setState({ tabs: [], activeTabId: null });
  });

  it("starts mirror from _title when command is not yet available", () => {
    handleBashToolUse("chat-1", "tool-1", "bash", { _title: "echo hello" });
    expect(useTerminalAiStore.getState().sessionMirrorLog["chat-1"]).toContain("echo hello");
  });

  it("does not duplicate mirror lines for the same tool call", () => {
    handleBashToolUse("chat-1", "tool-1", "bash", { command: "echo 1" });
    const log1 = useTerminalAiStore.getState().sessionMirrorLog["chat-1"] ?? "";
    handleBashToolUse("chat-1", "tool-1", "bash", { command: "echo 1" });
    const log2 = useTerminalAiStore.getState().sessionMirrorLog["chat-1"] ?? "";
    expect(log2).toBe(log1);
  });
});

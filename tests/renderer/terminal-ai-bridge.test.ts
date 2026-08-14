import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatMirrorCommandLine,
  truncateTerminalOutput,
} from "../../src/renderer/lib/terminal/ai-mirror";
import {
  handleBashToolUse,
  parseBashResultContent,
  tryExecutePtyBashAfterPermission,
} from "../../src/renderer/lib/terminal/ai-bridge";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { usePermissionStore } from "@/stores/permission-store";

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

  it("starts bash metadata from _title when command is not yet available", () => {
    handleBashToolUse("chat-1", "tool-1", "bash", { _title: "echo hello" });
    expect(useTerminalAiStore.getState().toolCallToChatTab["tool-1"]).toBe("chat-1");
    expect(useTerminalAiStore.getState().getBashForToolCall("tool-1")?.command).toBe("echo hello");
  });

  it("does not duplicate bash start for the same tool call", () => {
    handleBashToolUse("chat-1", "tool-1", "bash", { command: "echo 1" });
    handleBashToolUse("chat-1", "tool-1", "bash", { command: "echo 1" });
    expect(useTerminalAiStore.getState().getBashForToolCall("tool-1")?.command).toBe("echo 1");
    expect(Object.keys(useTerminalAiStore.getState().bashByToolCall)).toEqual(["tool-1"]);
  });
});

describe("tryExecutePtyBashAfterPermission", () => {
  const terminalRunAiBash = vi.fn();

  beforeEach(() => {
    terminalRunAiBash.mockReset();
    vi.stubGlobal("window", { electronAPI: { terminalRunAiBash } });
    useTerminalAiStore.getState().reset();
    useRightPanelStore.setState({ tabs: [], activeTabId: null });
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, permissionMode: "auto", agentTerminalMode: "pty" },
    }));
    useDocumentStore.setState({ projectRoot: "/proj", checkoutRoot: "/proj" } as never);
    useChatStore.setState({
      tabs: [{ id: "chat-1", sessionId: "ses-1" }],
    } as never);
    usePermissionStore.getState().markToolResolved("chat-1", "tool-1");
  });

  it("does not start a PTY from the renderer after permission", () => {
    tryExecutePtyBashAfterPermission("chat-1", "tool-1", "bash", { command: "echo once" });
    expect(terminalRunAiBash).not.toHaveBeenCalled();
  });
});

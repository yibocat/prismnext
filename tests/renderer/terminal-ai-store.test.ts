import { describe, expect, it, beforeEach } from "vitest";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useExecutionStore } from "@/stores/execution-store";
import type { TerminalExecutionSummary } from "../../src/shared/execution";

function closeAiTabInPanel(aiTabId: string) {
  useRightPanelStore.setState((s) => ({
    tabs: s.tabs.filter((t) => t.id !== aiTabId),
    activeTabId: s.activeTabId === aiTabId ? null : s.activeTabId,
  }));
}

function seedExecution(partial: Partial<TerminalExecutionSummary> & Pick<
  TerminalExecutionSummary,
  "executionId" | "toolCallId" | "chatTabId"
>): void {
  const summary: TerminalExecutionSummary = {
    origin: "agent-bash",
    state: "running",
    command: "echo hi",
    cwd: "/tmp",
    projectId: "/tmp",
    createdAt: 1,
    ...partial,
  };
  useExecutionStore.setState((s) => ({
    byId: {
      ...s.byId,
      [summary.executionId]: {
        lastSequence: 1,
        tail: "hello\n",
        replaying: false,
        summary,
      },
    },
    byToolCallId: {
      ...s.byToolCallId,
      [summary.toolCallId!]: summary.executionId,
    },
  }));
}

describe("terminal-ai-store", () => {
  beforeEach(() => {
    useTerminalAiStore.getState().reset();
    useExecutionStore.getState().reset();
    useRightPanelStore.setState({ tabs: [], activeTabId: null });
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, aiTerminalAutoOpen: true, jobMonitorAutoOpen: true },
    }));
  });

  it("does not keep a sessionMirrorLog after the Execution cutover", () => {
    expect("sessionMirrorLog" in useTerminalAiStore.getState()).toBe(false);
  });

  it("records bash state without creating a tab", () => {
    const aiTabId = useTerminalAiStore.getState().onBashStart("chat-1", "tool-1", "echo hi", "/tmp");
    expect(aiTabId).toBe("");
    expect(useTerminalAiStore.getState().getAiTabForToolCall("tool-1")).toBeUndefined();
    expect(useRightPanelStore.getState().tabs).toHaveLength(0);
    expect(useTerminalAiStore.getState().toolCallToChatTab["tool-1"]).toBe("chat-1");
    expect(useTerminalAiStore.getState().getBashForToolCall("tool-1")?.status).toBe("running");
    expect(useTerminalAiStore.getState().getBashForToolCall("tool-1")?.command).toBe("echo hi");
  });

  it("records output and exit on bash state, not a mirror log", () => {
    useTerminalAiStore.getState().onBashStart("chat-1", "tool-2", "npm test");
    useTerminalAiStore.getState().onBashOutput("tool-2", "ok\n", 0);
    const bash = useTerminalAiStore.getState().getBashForToolCall("tool-2");
    expect(bash?.output).toBe("ok\n");
    expect(bash?.exitCode).toBe(0);
    expect(bash?.status).toBe("completed");
  });

  it("removeAiTabsForChat clears chat mapping but retains bashByToolCall", () => {
    useTerminalAiStore.getState().onBashStart("chat-x", "tool-x", "ls");
    useTerminalAiStore.getState().onBashOutput("tool-x", "listed\n", 0);
    expect(useTerminalAiStore.getState().getBashForToolCall("tool-x")?.output).toBe("listed\n");
    useTerminalAiStore.getState().removeAiTabsForChat("chat-x");
    expect(useTerminalAiStore.getState().chatTabToAiTab["chat-x"]).toBeUndefined();
    expect(useTerminalAiStore.getState().getBashForToolCall("tool-x")).toBeUndefined();
  });

  it("newAiTerminalTab and openBashInTerminal return empty without an execution", () => {
    expect(
      useRightPanelStore.getState().newAiTerminalTab({
        chatTabId: "chat-1",
        toolCallId: "tool-1",
        title: "AI · echo hi",
      }),
    ).toBe("");
    expect(
      useTerminalAiStore.getState().openBashInTerminal({
        chatTabId: "chat-1",
        toolCallId: "tool-1",
        command: "echo hi",
        output: "hello\n",
        exitCode: 0,
      }),
    ).toBe("");
    expect(useRightPanelStore.getState().tabs).toHaveLength(0);
  });

  it("openBashInTerminal opens a Job Monitor for the existing execution", () => {
    seedExecution({ executionId: "exec-1", toolCallId: "tool-1", chatTabId: "chat-1" });
    const opened = useTerminalAiStore.getState().openBashInTerminal({
      chatTabId: "chat-1",
      toolCallId: "tool-1",
      command: "echo hi",
      output: "hello\n",
      exitCode: 0,
    });
    expect(opened).not.toBe("");
    const tab = useRightPanelStore.getState().tabs.find((t) => t.id === opened);
    expect(tab?.terminalSource).toBe("job-monitor");
    expect(tab?.linkedExecutionId).toBe("exec-1");
    expect(useExecutionStore.getState().isMonitorDismissed("chat-1")).toBe(false);
  });

  it("does not reopen a monitor from onBashStart after the user closed one", () => {
    seedExecution({ executionId: "exec-1", toolCallId: "tool-1", chatTabId: "chat-1" });
    const aiTabId = useRightPanelStore.getState().openJobMonitor("exec-1");
    useTerminalAiStore.getState().onBashStart("chat-1", "tool-1", "first");
    closeAiTabInPanel(aiTabId);
    useTerminalAiStore.getState().onAiTabClosedByUser(aiTabId);
    const reopened = useTerminalAiStore.getState().onBashStart("chat-1", "tool-2", "second");
    expect(reopened).toBe("");
    expect(useRightPanelStore.getState().tabs.some((tab) => tab.terminalSource === "job-monitor")).toBe(false);
  });

  it("reuses an already-open Job Monitor for later bash calls in the same chat", () => {
    seedExecution({ executionId: "exec-1", toolCallId: "tool-1", chatTabId: "chat-1" });
    const aiTabId = useRightPanelStore.getState().openJobMonitor("exec-1");
    const first = useTerminalAiStore.getState().onBashStart("chat-1", "tool-1", "first");
    const sameTab = useTerminalAiStore.getState().onBashStart("chat-1", "tool-2", "second");
    expect(first).toBe(aiTabId);
    expect(sameTab).toBe(aiTabId);
    const monitors = useRightPanelStore
      .getState()
      .tabs.filter((t) => t.terminalSource === "job-monitor" && t.linkedChatTabId === "chat-1");
    expect(monitors).toHaveLength(1);
  });

  it("keeps bash metadata in manual mode without opening a tab", () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, aiTerminalAutoOpen: false, jobMonitorAutoOpen: false },
    }));
    useTerminalAiStore.getState().onBashStart("chat-1", "tool-1", "first");
    useTerminalAiStore.getState().onBashStart("chat-1", "tool-2", "second");
    useTerminalAiStore.getState().onBashOutput("tool-2", "done\n", 0);
    expect(useTerminalAiStore.getState().getBashForToolCall("tool-1")?.command).toBe("first");
    expect(useTerminalAiStore.getState().getBashForToolCall("tool-2")?.output).toBe("done\n");
    expect(useTerminalAiStore.getState().getAiTabForChat("chat-1")).toBeUndefined();
  });

  it("focusLiveAiTerminal reuses the open Job Monitor", () => {
    seedExecution({ executionId: "exec-run", toolCallId: "tool-run", chatTabId: "chat-1", command: "sleep 60" });
    const aiTabId = useRightPanelStore.getState().openJobMonitor("exec-run");
    useTerminalAiStore.getState().onBashStart("chat-1", "tool-run", "sleep 60");
    const focused = useTerminalAiStore.getState().focusLiveAiTerminal("chat-1", "tool-run");
    expect(focused).toBe(aiTabId);
    expect(useRightPanelStore.getState().tabs.filter((t) => t.terminalSource === "job-monitor")).toHaveLength(1);
  });

  it("collapses leftover legacy AI tabs for the same chat", () => {
    useRightPanelStore.setState({
      tabs: [
        {
          id: "legacy-1",
          kind: "terminal",
          title: "AI 1",
          isInitial: false,
          terminalSource: "ai",
          linkedChatTabId: "chat-dup",
        },
        {
          id: "legacy-2",
          kind: "terminal",
          title: "AI 2",
          isInitial: false,
          terminalSource: "ai",
          linkedChatTabId: "chat-dup",
        },
      ],
      activeTabId: "legacy-1",
    });
    const kept = useTerminalAiStore.getState().onBashStart("chat-dup", "tool-1", "echo");
    expect(["legacy-1", "legacy-2"]).toContain(kept);
    const leftover = useRightPanelStore
      .getState()
      .tabs.filter((t) => t.terminalSource === "ai" && t.linkedChatTabId === "chat-dup");
    expect(leftover).toHaveLength(1);
  });
});

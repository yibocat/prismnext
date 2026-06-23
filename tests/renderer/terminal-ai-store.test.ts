import { describe, expect, it, beforeEach } from "vitest";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useSettingsStore } from "@/stores/settings-store";

function closeAiTabInPanel(aiTabId: string) {
  useRightPanelStore.setState((s) => ({
    tabs: s.tabs.filter((t) => t.id !== aiTabId),
    activeTabId: s.activeTabId === aiTabId ? null : s.activeTabId,
  }));
}

describe("terminal-ai-store", () => {
  beforeEach(() => {
    useTerminalAiStore.getState().reset();
    useRightPanelStore.setState({ tabs: [], activeTabId: null });
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, aiTerminalAutoOpen: true },
    }));
  });

  it("maps toolCallId to ai tab on bash start", () => {
    const aiTabId = useTerminalAiStore.getState().onBashStart("chat-1", "tool-1", "echo hi", "/tmp");
    expect(useTerminalAiStore.getState().getAiTabForToolCall("tool-1")).toBe(aiTabId);
    expect(useTerminalAiStore.getState().chatTabToAiTab["chat-1"]).toBe(aiTabId);
    expect(useTerminalAiStore.getState().mirrorText[aiTabId]).toContain("echo hi");
  });

  it("appends output and exit footer on bash result", () => {
    const aiTabId = useTerminalAiStore.getState().onBashStart("chat-1", "tool-2", "npm test");
    useTerminalAiStore.getState().onBashOutput("tool-2", "ok\n", 0);
    const bash = useTerminalAiStore.getState().getBashForToolCall("tool-2");
    expect(bash?.output).toBe("ok\n");
    expect(bash?.exitCode).toBe(0);
    expect(useTerminalAiStore.getState().mirrorText[aiTabId]).toContain("ok");
  });

  it("removeAiTabsForChat clears chat mapping but retains session mirror log", () => {
    useTerminalAiStore.getState().onBashStart("chat-x", "tool-x", "ls");
    useTerminalAiStore.getState().onBashOutput("tool-x", "listed\n", 0);
    const log = useTerminalAiStore.getState().sessionMirrorLog["chat-x"];
    expect(log).toBeTruthy();
    useTerminalAiStore.getState().removeAiTabsForChat("chat-x");
    expect(useTerminalAiStore.getState().chatTabToAiTab["chat-x"]).toBeUndefined();
    expect(useTerminalAiStore.getState().sessionMirrorLog["chat-x"]).toBe(log);
  });

  it("preserves session mirror when user closes AI tab", () => {
    const aiTabId = useTerminalAiStore.getState().onBashStart("chat-1", "tool-1", "echo hi");
    useTerminalAiStore.getState().onBashOutput("tool-1", "hello\n", 0);
    const mirror = useTerminalAiStore.getState().mirrorText[aiTabId];
    closeAiTabInPanel(aiTabId);
    useTerminalAiStore.getState().onAiTabClosedByUser(aiTabId);
    expect(useTerminalAiStore.getState().getAiTabForToolCall("tool-1")).toBeUndefined();
    expect(useTerminalAiStore.getState().sessionMirrorLog["chat-1"]).toBe(mirror);
    expect(useTerminalAiStore.getState().userDismissedAiTab["chat-1"]).toBe(true);
  });

  it("reopens AI tab from session mirror after close", () => {
    const aiTabId = useTerminalAiStore.getState().onBashStart("chat-1", "tool-1", "echo hi");
    useTerminalAiStore.getState().onBashOutput("tool-1", "hello\n", 0);
    const mirror = useTerminalAiStore.getState().mirrorText[aiTabId];
    closeAiTabInPanel(aiTabId);
    useTerminalAiStore.getState().onAiTabClosedByUser(aiTabId);
    const reopened = useTerminalAiStore.getState().openBashInTerminal({
      chatTabId: "chat-1",
      toolCallId: "tool-1",
      command: "echo hi",
      output: "hello\n",
      exitCode: 0,
    });
    expect(reopened).not.toBe(aiTabId);
    expect(useTerminalAiStore.getState().mirrorText[reopened]).toBe(mirror);
    expect(useTerminalAiStore.getState().userDismissedAiTab["chat-1"]).toBe(false);
  });

  it("keeps mirroring in manual mode without opening tab", () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, aiTerminalAutoOpen: false },
    }));
    useTerminalAiStore.getState().onBashStart("chat-1", "tool-1", "first");
    useTerminalAiStore.getState().onBashStart("chat-1", "tool-2", "second");
    useTerminalAiStore.getState().onBashOutput("tool-2", "done\n", 0);
    const log = useTerminalAiStore.getState().sessionMirrorLog["chat-1"] ?? "";
    expect(log).toContain("first");
    expect(log).toContain("second");
    expect(log).toContain("done");
    expect(useTerminalAiStore.getState().getAiTabForChat("chat-1")).toBeUndefined();
  });

  it("auto mode reopens tab after user closed AI tab", () => {
    const aiTabId = useTerminalAiStore.getState().onBashStart("chat-1", "tool-1", "first");
    closeAiTabInPanel(aiTabId);
    useTerminalAiStore.getState().onAiTabClosedByUser(aiTabId);
    const reopened = useTerminalAiStore.getState().onBashStart("chat-1", "tool-2", "second");
    expect(reopened).not.toBe("");
    expect(reopened).not.toBe(aiTabId);
    expect(useTerminalAiStore.getState().getAiTabForChat("chat-1")).toBe(reopened);
  });

  it("reuses the same AI tab for multiple bash calls in one chat", () => {
    const aiTabId = useTerminalAiStore.getState().onBashStart("chat-1", "tool-1", "first");
    const sameTab = useTerminalAiStore.getState().onBashStart("chat-1", "tool-2", "second");
    expect(sameTab).toBe(aiTabId);
    const aiTabs = useRightPanelStore
      .getState()
      .tabs.filter((t) => t.terminalSource === "ai" && t.linkedChatTabId === "chat-1");
    expect(aiTabs).toHaveLength(1);
  });

  it("consolidates duplicate AI tabs for the same chat on bash start", () => {
    const dup1 = useRightPanelStore.getState().newAiTerminalTab({
      chatTabId: "chat-dup",
      title: "AI 1",
      command: "a",
    });
    const dup2 = useRightPanelStore.getState().newAiTerminalTab({
      chatTabId: "chat-dup",
      title: "AI 2",
      command: "b",
    });
    const kept = useTerminalAiStore.getState().onBashStart("chat-dup", "tool-1", "echo");
    expect([dup1, dup2]).toContain(kept);
    const aiTabs = useRightPanelStore
      .getState()
      .tabs.filter((t) => t.terminalSource === "ai" && t.linkedChatTabId === "chat-dup");
    expect(aiTabs).toHaveLength(1);
    expect(useTerminalAiStore.getState().userDismissedAiTab["chat-dup"]).toBeUndefined();
  });

  it("syncs open tab mirror when session log grows", () => {
    const aiTabId = useTerminalAiStore.getState().onBashStart("chat-1", "tool-1", "first");
    useTerminalAiStore.getState().onBashOutput("tool-1", "one\n", 0);
    useTerminalAiStore.getState().onBashStart("chat-1", "tool-2", "second");
    useTerminalAiStore.getState().onBashOutput("tool-2", "two\n", 0);
    const log = useTerminalAiStore.getState().sessionMirrorLog["chat-1"] ?? "";
    expect(useTerminalAiStore.getState().mirrorText[aiTabId]).toBe(log);
    expect(log).toContain("first");
    expect(log).toContain("second");
    expect(log).toContain("two");
  });

  it("focusLiveAiTerminal reuses open tab without rebuilding mirror", () => {
    const aiTabId = useTerminalAiStore.getState().onBashStart("chat-1", "tool-run", "sleep 60");
    const focused = useTerminalAiStore.getState().focusLiveAiTerminal("chat-1", "tool-run");
    expect(focused).toBe(aiTabId);
    expect(useRightPanelStore.getState().tabs.filter((t) => t.terminalSource === "ai")).toHaveLength(1);
  });

  it("openBashInTerminal replays from session log after command completes", () => {
    const aiTabId = useTerminalAiStore.getState().onBashStart("chat-1", "tool-1", "echo hi");
    useTerminalAiStore.getState().onBashOutput("tool-1", "hello\n", 0);
    const mirror = useTerminalAiStore.getState().sessionMirrorLog["chat-1"];
    closeAiTabInPanel(aiTabId);
    useTerminalAiStore.getState().onAiTabClosedByUser(aiTabId);
    const replayed = useTerminalAiStore.getState().openBashInTerminal({
      chatTabId: "chat-1",
      toolCallId: "tool-1",
      command: "echo hi",
      output: "hello\n",
      exitCode: 0,
    });
    expect(replayed).not.toBe(aiTabId);
    expect(useTerminalAiStore.getState().mirrorText[replayed]).toBe(mirror);
  });
});

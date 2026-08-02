import { describe, it, expect, beforeEach, vi } from "vitest";

const terminalDestroyTab = vi.fn();
const terminalDestroyTabs = vi.fn();

vi.stubGlobal("window", {
  electronAPI: {
    terminalDestroyTab,
    terminalDestroyTabs,
    terminalLoadConfig: vi.fn().mockResolvedValue({ quickCommands: [] }),
    terminalSaveConfig: vi.fn(),
    terminalEnvInfo: vi.fn(),
  },
  confirm: vi.fn(() => true),
});

vi.mock("@/stores/document-store", () => ({
  useDocumentStore: {
    getState: () => ({
      projectRoot: "/proj",
      setActiveFile: vi.fn(),
      isFileDirty: () => false,
    }),
  },
}));

import { useTerminalStore } from "../../src/renderer/stores/terminal-store";
import { useRightPanelStore } from "../../src/renderer/stores/right-panel-store";
import { useTabCloseConfirmStore } from "../../src/renderer/stores/tab-close-confirm-store";
import { getTabCloseConfirmation } from "../../src/renderer/lib/workspace/tab-close-confirmation";

describe("terminal lifecycle", () => {
  beforeEach(() => {
    terminalDestroyTab.mockClear();
    terminalDestroyTabs.mockClear();
    useTerminalStore.setState({
      quickCommands: [],
      envInfo: null,
      loaded: true,
      sessions: {},
      restartNonce: {},
    });
    useRightPanelStore.setState({
      tabs: [],
      activeTabId: null,
    });
    useTabCloseConfirmStore.setState({ pending: null });
  });

  it("idle terminal tab does not require close confirmation", () => {
    useTerminalStore.getState().registerSession("t1", "t1:0", {
      shell: "/bin/zsh",
      cwd: "/proj",
      pid: 1,
    });
    expect(
      getTabCloseConfirmation({
        id: "t1",
        kind: "terminal",
        title: "proj",
        isInitial: false,
      }),
    ).toBeNull();
  });

  it("busy terminal tab requires close confirmation", () => {
    useTerminalStore.getState().registerSession("t1", "t1:0", {
      shell: "/bin/zsh",
      cwd: "/proj",
      pid: 1,
    });
    useTerminalStore.getState().setBusy("t1", true);
    expect(
      getTabCloseConfirmation({
        id: "t1",
        kind: "terminal",
        title: "proj",
        isInitial: false,
      })?.title,
    ).toBe("Close Terminal");
  });

  it("closeAllTabs with busy terminal opens confirm instead of destroying immediately", () => {
    useRightPanelStore.setState({
      tabs: [{ id: "t1", kind: "terminal", title: "Terminal", isInitial: false }],
      activeTabId: "t1",
    });
    useTerminalStore.getState().registerSession("t1", "t1:0", {
      shell: "/bin/zsh",
      cwd: "/proj",
      pid: 1,
    });
    useTerminalStore.getState().setBusy("t1", true);

    useRightPanelStore.getState().closeAllTabs();

    expect(terminalDestroyTabs).not.toHaveBeenCalled();
    expect(useTabCloseConfirmStore.getState().pending?.title).toBe("Close Terminal");
    expect(useRightPanelStore.getState().tabs).toHaveLength(1);
  });

  it("closeTabsOfKind with busy terminal opens confirm instead of destroying immediately", () => {
    useRightPanelStore.setState({
      tabs: [{ id: "t1", kind: "terminal", title: "A", isInitial: false }],
      activeTabId: "t1",
    });
    useTerminalStore.getState().registerSession("t1", "t1:0", {
      shell: "/bin/zsh",
      cwd: "/proj",
      pid: 1,
    });
    useTerminalStore.getState().setBusy("t1", true);

    useRightPanelStore.getState().closeTabsOfKind("terminal");

    expect(terminalDestroyTabs).not.toHaveBeenCalled();
    expect(useTabCloseConfirmStore.getState().pending?.title).toBe("Close Terminal");
    expect(useRightPanelStore.getState().tabs).toHaveLength(1);
  });

  it("requestCloseTab with busy terminal opens confirm dialog", () => {
    useRightPanelStore.setState({
      tabs: [{ id: "t1", kind: "terminal", title: "Terminal", isInitial: false }],
      activeTabId: "t1",
    });
    useTerminalStore.getState().registerSession("t1", "t1:0", {
      shell: "/bin/zsh",
      cwd: "/proj",
      pid: 1,
    });
    useTerminalStore.getState().setBusy("t1", true);

    const closed = useRightPanelStore.getState().requestCloseTab("t1");

    expect(closed).toBe(false);
    expect(terminalDestroyTab).not.toHaveBeenCalled();
    expect(useTabCloseConfirmStore.getState().pending?.title).toBe("Close Terminal");
    expect(useRightPanelStore.getState().tabs).toHaveLength(1);
  });

  it("closeAllTabs destroys terminal sessions and resets terminal store", () => {
    useRightPanelStore.setState({
      tabs: [
        { id: "t1", kind: "terminal", title: "Terminal", isInitial: false },
        { id: "f1", kind: "file", title: "main.tex", isInitial: false, fileId: "main.tex" },
      ],
      activeTabId: "t1",
    });
    useTerminalStore.getState().registerSession("t1", "t1:0", {
      shell: "/bin/zsh",
      cwd: "/proj",
      pid: 1,
    });

    useRightPanelStore.getState().closeAllTabs();

    expect(terminalDestroyTabs).toHaveBeenCalledWith({ tabIds: ["t1"] });
    expect(useRightPanelStore.getState().tabs).toEqual([]);
    expect(useTerminalStore.getState().sessions).toEqual({});
  });

  it("closeTabsOfKind calls onClosed after idle tabs are removed", () => {
    const onClosed = vi.fn();
    useRightPanelStore.setState({
      tabs: [{ id: "t1", kind: "terminal", title: "Terminal", isInitial: false }],
      activeTabId: "t1",
    });
    useTerminalStore.getState().registerSession("t1", "t1:0", {
      shell: "/bin/zsh",
      cwd: "/proj",
      pid: 1,
    });

    useRightPanelStore.getState().closeTabsOfKind("terminal", { onClosed });

    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(useRightPanelStore.getState().tabs).toEqual([]);
  });

  it("closeTabsOfKind does not call onClosed when user must confirm", () => {
    const onClosed = vi.fn();
    useRightPanelStore.setState({
      tabs: [{ id: "t1", kind: "terminal", title: "Terminal", isInitial: false }],
      activeTabId: "t1",
    });
    useTerminalStore.getState().registerSession("t1", "t1:0", {
      shell: "/bin/zsh",
      cwd: "/proj",
      pid: 1,
    });
    useTerminalStore.getState().setBusy("t1", true);

    useRightPanelStore.getState().closeTabsOfKind("terminal", { onClosed });

    expect(onClosed).not.toHaveBeenCalled();
    expect(useTabCloseConfirmStore.getState().pending).not.toBeNull();
  });

  it("closeTabsOfKind terminal destroys all terminal PTYs", () => {
    useRightPanelStore.setState({
      tabs: [
        { id: "t1", kind: "terminal", title: "A", isInitial: false },
        { id: "t2", kind: "terminal", title: "B", isInitial: false },
      ],
      activeTabId: "t1",
    });
    useTerminalStore.getState().registerSession("t1", "t1:0", {
      shell: "/bin/zsh",
      cwd: "/proj",
      pid: 1,
    });
    useTerminalStore.getState().registerSession("t2", "t2:0", {
      shell: "/bin/zsh",
      cwd: "/proj",
      pid: 2,
    });

    useRightPanelStore.getState().closeTabsOfKind("terminal");

    expect(terminalDestroyTabs).toHaveBeenCalledWith({ tabIds: ["t1", "t2"] });
    expect(useRightPanelStore.getState().tabs).toEqual([]);
    expect(useTerminalStore.getState().sessions).toEqual({});
  });

  it("requestCloseTab destroys terminal tab via terminal store", () => {
    useRightPanelStore.setState({
      tabs: [{ id: "t1", kind: "terminal", title: "Terminal", isInitial: false }],
      activeTabId: "t1",
    });
    useTerminalStore.getState().markSessionExited("t1", 0);

    const closed = useRightPanelStore.getState().requestCloseTab("t1");
    expect(closed).toBe(true);
    expect(terminalDestroyTab).toHaveBeenCalledWith({ tabId: "t1" });
    expect(useRightPanelStore.getState().tabs).toEqual([]);
  });
});

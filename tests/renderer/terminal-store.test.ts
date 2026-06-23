import { describe, it, expect, beforeEach, vi } from "vitest";

const terminalDestroyTab = vi.fn();
const terminalDestroyTabs = vi.fn();
const terminalLoadConfig = vi.fn().mockResolvedValue({ quickCommands: [] });
const terminalSaveConfig = vi.fn().mockResolvedValue(undefined);
const terminalEnvInfo = vi.fn().mockResolvedValue({
  shell: "/bin/zsh",
  cwd: "/tmp",
  platform: "darwin",
  nodeVersion: "v20.0.0",
  home: "/Users/test",
});

vi.stubGlobal("window", {
  electronAPI: {
    terminalDestroyTab,
    terminalDestroyTabs,
    terminalLoadConfig,
    terminalSaveConfig,
    terminalEnvInfo,
  },
});

vi.mock("@/stores/document-store", () => ({
  useDocumentStore: {
    getState: () => ({ projectRoot: "/proj" }),
  },
}));

const updateTerminalTabTitle = vi.fn();

vi.mock("@/stores/right-panel-store", () => ({
  useRightPanelStore: {
    getState: () => ({ updateTerminalTabTitle }),
  },
}));

import { useTerminalStore } from "../../src/renderer/stores/terminal-store";

describe("terminal-store", () => {
  beforeEach(() => {
    useTerminalStore.setState({
      quickCommands: [],
      envInfo: null,
      loaded: false,
      sessions: {
        "tab-old": {
          tabId: "tab-old",
          sessionId: "tab-old:1",
          shell: "/bin/zsh",
          cwd: "/proj",
          pid: 1,
          status: "running",
          busy: false,
          startedAt: Date.now(),
        },
      },
      restartNonce: { "tab-old": 2 },
    });
    terminalDestroyTab.mockClear();
    terminalDestroyTabs.mockClear();
    terminalLoadConfig.mockClear();
    updateTerminalTabTitle.mockClear();
  });

  it("registerSession stores running metadata", () => {
    useTerminalStore.getState().registerSession("tab-1", "tab-1:0", {
      shell: "/bin/zsh",
      cwd: "/proj",
      pid: 42,
    });
    const session = useTerminalStore.getState().sessions["tab-1"];
    expect(session?.status).toBe("running");
    expect(session?.pid).toBe(42);
  });

  it("markSessionExited updates status and exit code", () => {
    useTerminalStore.getState().registerSession("tab-1", "tab-1:0", {
      shell: "/bin/zsh",
      cwd: "/proj",
      pid: 42,
    });
    useTerminalStore.getState().markSessionExited("tab-1", 0);
    const session = useTerminalStore.getState().sessions["tab-1"];
    expect(session?.status).toBe("exited");
    expect(session?.exitCode).toBe(0);
    expect(session?.endedAt).toBeTypeOf("number");
  });

  it("destroyTab calls IPC and removes session", () => {
    useTerminalStore.getState().destroyTab("tab-old");
    expect(terminalDestroyTab).toHaveBeenCalledWith({ tabId: "tab-old" });
    expect(useTerminalStore.getState().sessions["tab-old"]).toBeUndefined();
  });

  it("destroyAllTerminalTabs batch destroys and clears sessions", () => {
    useTerminalStore.getState().registerSession("tab-2", "tab-2:0", {
      shell: "/bin/zsh",
      cwd: "/proj",
      pid: 43,
    });
    useTerminalStore.getState().destroyAllTerminalTabs(["tab-old", "tab-2"]);
    expect(terminalDestroyTabs).toHaveBeenCalledWith({
      tabIds: ["tab-old", "tab-2"],
    });
    expect(useTerminalStore.getState().sessions).toEqual({});
  });

  it("resetProjectState clears volatile terminal state", () => {
    useTerminalStore.getState().resetProjectState();
    const state = useTerminalStore.getState();
    expect(state.sessions).toEqual({});
    expect(state.envInfo).toBeNull();
    expect(state.restartNonce).toEqual({});
  });

  it("loadFromProject clears old sessions and loads quick commands", async () => {
    terminalLoadConfig.mockResolvedValueOnce({
      quickCommands: [{ id: "q1", label: "Test", command: "echo hi", order: 0, createdAt: 1 }],
    });
    await useTerminalStore.getState().loadFromProject("/proj");
    const state = useTerminalStore.getState();
    expect(state.sessions).toEqual({});
    expect(state.quickCommands).toHaveLength(1);
    expect(state.loaded).toBe(true);
  });

  it("setBusy toggles command-running flag", () => {
    useTerminalStore.getState().registerSession("tab-1", "tab-1:0", {
      shell: "/bin/zsh",
      cwd: "/proj",
      pid: 42,
    });
    useTerminalStore.getState().setBusy("tab-1", true);
    expect(useTerminalStore.getState().sessions["tab-1"]?.busy).toBe(true);
    useTerminalStore.getState().setBusy("tab-1", false);
    expect(useTerminalStore.getState().sessions["tab-1"]?.busy).toBe(false);
  });

  it("setSessionCommand stores command and updates tab title", () => {
    useTerminalStore.getState().registerSession("tab-1", "tab-1:0", {
      shell: "/bin/zsh",
      cwd: "/proj",
      pid: 42,
    });
    useTerminalStore.getState().setSessionCommand("tab-1", "pnpm test");
    expect(useTerminalStore.getState().sessions["tab-1"]?.lastCommand).toBe("pnpm test");
    expect(updateTerminalTabTitle).toHaveBeenCalledWith("tab-1", "pnpm test");
  });

  it("requestRestart increments restart nonce", () => {
    useTerminalStore.getState().requestRestart("tab-1");
    expect(useTerminalStore.getState().restartNonce["tab-1"]).toBe(1);
  });
});

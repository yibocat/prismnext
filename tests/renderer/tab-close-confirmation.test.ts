import { describe, it, expect, beforeEach, vi } from "vitest";
import type { RightTab } from "../../src/renderer/lib/workspace/mode-registry";

vi.mock("@/stores/terminal-store", () => ({
  useTerminalStore: {
    getState: vi.fn(),
  },
}));

vi.mock("@/stores/terminal-ai-store", () => ({
  useTerminalAiStore: {
    getState: vi.fn(),
  },
}));

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: {
    getState: vi.fn(() => ({
      settings: {},
    })),
  },
}));

vi.mock("@/stores/right-panel-store", () => ({
  useRightPanelStore: {
    getState: vi.fn(() => ({
      tabs: [],
    })),
  },
}));

vi.mock("@/stores/document-store", () => ({
  useDocumentStore: {
    getState: vi.fn(() => ({
      isFileDirty: () => false,
    })),
  },
}));

import { useTerminalStore } from "../../src/renderer/stores/terminal-store";
import { useTerminalAiStore } from "../../src/renderer/stores/terminal-ai-store";
import { useSettingsStore } from "../../src/renderer/stores/settings-store";
import { useRightPanelStore } from "../../src/renderer/stores/right-panel-store";
import { getTabCloseConfirmation } from "../../src/renderer/lib/workspace/tab-close-confirmation";

const terminalTab: RightTab = {
  id: "t1",
  kind: "terminal",
  title: "proj",
  isInitial: false,
};

const aiTerminalTab: RightTab = {
  id: "ai-1",
  kind: "terminal",
  title: "✨ AI",
  isInitial: false,
  terminalSource: "ai",
  linkedChatTabId: "chat-1",
};

describe("tab-close-confirmation", () => {
  beforeEach(() => {
    vi.mocked(useTerminalStore.getState).mockReturnValue({
      sessions: {},
    } as ReturnType<typeof useTerminalStore.getState>);
    vi.mocked(useTerminalAiStore.getState).mockReturnValue({
      getSessionStateForAiTab: () => undefined,
    } as ReturnType<typeof useTerminalAiStore.getState>);
    vi.mocked(useSettingsStore.getState).mockReturnValue({
      settings: {},
    } as ReturnType<typeof useSettingsStore.getState>);
  });

  it("does not confirm idle terminal tabs", () => {
    vi.mocked(useTerminalStore.getState).mockReturnValue({
      sessions: {
        t1: {
          tabId: "t1",
          sessionId: "t1:0",
          shell: "/bin/zsh",
          cwd: "/proj",
          pid: 1,
          status: "running",
          busy: false,
          startedAt: Date.now(),
        },
      },
    } as ReturnType<typeof useTerminalStore.getState>);

    expect(getTabCloseConfirmation(terminalTab)).toBeNull();
  });

  it("confirms terminal tabs with busy foreground command", () => {
    vi.mocked(useTerminalStore.getState).mockReturnValue({
      sessions: {
        t1: {
          tabId: "t1",
          sessionId: "t1:0",
          shell: "/bin/zsh",
          cwd: "/proj",
          pid: 1,
          status: "running",
          busy: true,
          startedAt: Date.now(),
        },
      },
    } as ReturnType<typeof useTerminalStore.getState>);

    const confirmation = getTabCloseConfirmation(terminalTab);
    expect(confirmation?.title).toBe("Close Terminal");
    expect(confirmation?.destructive).toBe(true);
  });

  it("confirms AI terminal tabs while command is running", () => {
    vi.mocked(useRightPanelStore.getState).mockReturnValue({
      tabs: [aiTerminalTab],
    } as ReturnType<typeof useRightPanelStore.getState>);
    vi.mocked(useTerminalAiStore.getState).mockReturnValue({
      getSessionStateForAiTab: () => ({
        sessionId: "sess-1",
        chatTabId: "chat-1",
        phase: "running",
        lastViewedAt: Date.now(),
      }),
    } as ReturnType<typeof useTerminalAiStore.getState>);

    const confirmation = getTabCloseConfirmation(aiTerminalTab);
    expect(confirmation?.title).toBe("Close AI Terminal");
    expect(confirmation?.destructive).toBe(false);
  });

  it("marks AI terminal close as destructive when kill-on-close is enabled", () => {
    vi.mocked(useRightPanelStore.getState).mockReturnValue({
      tabs: [aiTerminalTab],
    } as ReturnType<typeof useRightPanelStore.getState>);
    vi.mocked(useTerminalAiStore.getState).mockReturnValue({
      getSessionStateForAiTab: () => ({
        sessionId: "sess-1",
        chatTabId: "chat-1",
        phase: "running",
        lastViewedAt: Date.now(),
      }),
    } as ReturnType<typeof useTerminalAiStore.getState>);
    vi.mocked(useSettingsStore.getState).mockReturnValue({
      settings: { aiTerminalCloseTabKillsProcess: true },
    } as ReturnType<typeof useSettingsStore.getState>);

    const confirmation = getTabCloseConfirmation(aiTerminalTab);
    expect(confirmation?.destructive).toBe(true);
  });
});

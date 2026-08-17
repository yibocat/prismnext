import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isExperimentalPiRuntime,
  shouldShowExperimentalPiNav,
} from "../../src/shared/pi-lab";

const piLabSend = vi.fn().mockResolvedValue({ ok: false, error: "missing_project" });
const piLabCancel = vi.fn().mockResolvedValue({ ok: true });
const piLabReset = vi.fn().mockResolvedValue({ ok: true });
const chatSend = vi.fn();
const chatCancel = vi.fn().mockResolvedValue(undefined);

vi.mock("@/stores/document-store", () => ({
  useDocumentStore: { getState: () => ({ projectRoot: "/tmp/project" }) },
}));

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: {
    getState: () => ({
      settings: {
        aiProvider: "anthropic",
        aiModel: "claude-sonnet-4-5",
        aiApiKeys: { anthropic: "sk-test" },
      },
    }),
  },
}));

vi.mock("@/lib/git/checkout-context", () => ({
  applyCheckoutTransition: vi.fn().mockResolvedValue(undefined),
  attachWorktreeForSessionDirectory: vi.fn().mockResolvedValue(undefined),
  captureSessionCwd: vi.fn(),
  resolveWorktreeAtCheckout: vi.fn(),
  resolveWorktreePathForSend: vi.fn(),
  isWorktreeCheckoutPath: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/git/worktree-path", () => ({
  isWorktreeDirectoryActive: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/git/worktree-present", () => ({
  isWorktreeCheckoutOnDisk: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/git/worktree-sessions", () => ({
  rehomeWorktreeSessions: vi.fn().mockResolvedValue(undefined),
}));

vi.stubGlobal("window", {
  electronAPI: {
    piLabSend,
    piLabCancel,
    piLabReset,
    chatSend,
    chatCancel,
    sessionRename: vi.fn(),
  },
});

import { useChatStore } from "../../src/renderer/stores/chat-store";

describe("experimental Pi chat tab", () => {
  it("is only a development nav entry", () => {
    expect(shouldShowExperimentalPiNav({ isDev: true })).toBe(true);
    expect(shouldShowExperimentalPiNav({ isDev: false })).toBe(false);
  });

  it("treats only runtime=pi as the experimental backend", () => {
    expect(isExperimentalPiRuntime("pi")).toBe(true);
    expect(isExperimentalPiRuntime("opencode")).toBe(false);
    expect(isExperimentalPiRuntime(undefined)).toBe(false);
  });
});

describe("chat-store Pi tab routing", () => {
  beforeEach(() => {
    useChatStore.getState().clearAllSessions();
    piLabSend.mockClear();
    piLabCancel.mockClear();
    piLabReset.mockClear();
    chatSend.mockClear();
    chatCancel.mockClear();
  });

  it("creates one Pi tab and focuses it on repeat", () => {
    useChatStore.getState().newPiSession();
    const firstId = useChatStore.getState().activeTabId;
    const first = useChatStore.getState().tabs.find((tab) => tab.id === firstId);
    expect(first?.runtime).toBe("pi");
    expect(first?.title).toBe("Experimental Pi");

    useChatStore.getState().newPiSession();
    expect(useChatStore.getState().activeTabId).toBe(firstId);
    expect(useChatStore.getState().tabs.filter((tab) => tab.runtime === "pi")).toHaveLength(1);
  });

  it("keeps New Agent on OpenCode", () => {
    useChatStore.getState().newPiSession();
    useChatStore.getState().newSession();
    const active = useChatStore.getState().tabs.find((tab) => tab.id === useChatStore.getState().activeTabId);
    expect(active?.runtime).toBe("opencode");
    expect(useChatStore.getState().tabs.some((tab) => tab.runtime === "pi")).toBe(true);
  });

  it("sends Pi tab prompts through pi-lab, not chat:send", async () => {
    useChatStore.getState().newPiSession();
    const tabId = useChatStore.getState().activeTabId;
    await useChatStore.getState().sendPrompt("hello from pi");
    expect(piLabSend).toHaveBeenCalledWith(expect.objectContaining({
      text: "hello from pi",
      tabId,
      projectRoot: "/tmp/project",
    }));
    expect(chatSend).not.toHaveBeenCalled();
  });

  it("closes a Pi tab via pi-lab cancel/reset, not chatCancel", () => {
    useChatStore.getState().newPiSession();
    const piId = useChatStore.getState().activeTabId;
    useChatStore.getState().newSession();
    useChatStore.getState().closeTab(piId);
    expect(piLabCancel).toHaveBeenCalled();
    expect(piLabReset).toHaveBeenCalled();
    expect(chatCancel).not.toHaveBeenCalled();
    expect(useChatStore.getState().tabs.some((tab) => tab.id === piId)).toBe(false);
  });
});

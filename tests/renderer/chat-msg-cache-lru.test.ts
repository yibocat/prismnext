import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/stores/document-store", () => ({
  useDocumentStore: { getState: () => ({ projectRoot: "" }) },
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
  electronAPI: {},
});

import {
  useChatStore,
  _msgCacheMaxForTests,
  _msgCacheSetForTests,
} from "../../src/renderer/stores/chat-store";

describe("chat-store _msgCache LRU (Bug #23)", () => {
  beforeEach(() => {
    useChatStore.getState().clearAllSessions();
    (useChatStore as any)._msgCache.clear();
  });

  it("evicts oldest sessions once over MSG_CACHE_MAX", () => {
    const max = _msgCacheMaxForTests();
    const empty: [] = [];
    for (let i = 0; i < max + 5; i++) {
      _msgCacheSetForTests(`ses-${i}`, empty);
    }
    const cache: Map<string, unknown> = (useChatStore as any)._msgCache;
    expect(cache.size).toBe(max);
    expect(cache.has("ses-0")).toBe(false);
    expect(cache.has("ses-4")).toBe(false);
    expect(cache.has(`ses-${max + 4}`)).toBe(true);
  });
});

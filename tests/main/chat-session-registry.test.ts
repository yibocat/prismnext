import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  registerChatSession,
  resolveChatTabId,
  resolveChatSessionId,
  unregisterChatSession,
  _resetChatSessionRegistryForTests,
} from "../../src/main/services/chat-session-registry";

describe("chat-session-registry", () => {
  beforeEach(() => {
    _resetChatSessionRegistryForTests();
  });

  it("maps session id to chat tab id", () => {
    registerChatSession("sess-1", "chat-tab-a");
    expect(resolveChatTabId("sess-1")).toBe("chat-tab-a");
    expect(resolveChatSessionId("chat-tab-a")).toBe("sess-1");
  });

  it("replaces previous session for the same tab", () => {
    registerChatSession("sess-1", "chat-tab-a");
    registerChatSession("sess-2", "chat-tab-a");
    expect(resolveChatTabId("sess-1")).toBeUndefined();
    expect(resolveChatTabId("sess-2")).toBe("chat-tab-a");
  });

  it("unregisters session", () => {
    registerChatSession("sess-1", "chat-tab-a");
    unregisterChatSession("sess-1");
    expect(resolveChatTabId("sess-1")).toBeUndefined();
    expect(resolveChatSessionId("chat-tab-a")).toBeUndefined();
  });
});

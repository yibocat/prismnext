import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  registerChatSession,
  resolveChatTabId,
  resolveChatSessionId,
  getSessionProjectRoot,
  unregisterChatSession,
  resolveCitationStagingSessionId,
  resolveSessionScratchKey,
  setSessionScratchLookup,
  isSubAgentSession,
  _resetChatSessionRegistryForTests,
} from "../../src/main/services/chat-session-registry";

describe("chat-session-registry", () => {
  beforeEach(() => {
    _resetChatSessionRegistryForTests();
  });

  it("maps session id to chat tab id", () => {
    registerChatSession("sess-1", "chat-tab-a", "/tmp/project");
    expect(resolveChatTabId("sess-1")).toBe("chat-tab-a");
    expect(resolveChatSessionId("chat-tab-a")).toBe("sess-1");
    expect(getSessionProjectRoot("sess-1")).toBe("/tmp/project");
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

  it("maps Pi child session ids back to the parent for citation staging", () => {
    expect(resolveCitationStagingSessionId("rt-parent")).toBe("rt-parent");
    expect(isSubAgentSession("rt-parent")).toBe(false);
    expect(resolveCitationStagingSessionId("sub-rt-parent-1710000000000")).toBe("rt-parent");
    expect(isSubAgentSession("sub-rt-parent-1710000000000")).toBe(true);
    expect(resolveCitationStagingSessionId("sub-task-session")).toBe("sub-task-session");
    expect(isSubAgentSession("sub-task-session")).toBe(false);
  });

  it("uses the peeled id as scratch key when no store is injected", () => {
    expect(resolveSessionScratchKey("sess-1")).toBe("sess-1");
    expect(resolveSessionScratchKey("sub-rt-parent-1710000000000")).toBe("rt-parent");
  });

  it("maps a runtime id to conversationId when lookup is injected", () => {
    setSessionScratchLookup({
      getSession(id) {
        if (id === "rt-1") return { conversationId: "conv-1", runtimeSessionId: "rt-1" };
        return null;
      },
      getByConversationId(id) {
        if (id === "conv-1") return { conversationId: "conv-1", runtimeSessionId: "rt-1" };
        return null;
      },
    });
    expect(resolveSessionScratchKey("rt-1")).toBe("conv-1");
    expect(resolveSessionScratchKey("sub-rt-1-1710000000000")).toBe("conv-1");
    expect(resolveSessionScratchKey("unknown")).toBe("unknown");
    expect(resolveSessionScratchKey("conv-1")).toBe("conv-1");
  });
});

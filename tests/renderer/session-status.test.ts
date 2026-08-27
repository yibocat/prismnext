import { describe, expect, it } from "vitest";
import {
  deriveSessionListStatus,
  isActiveSessionFromChatState,
  matchesSessionStatusFilter,
} from "../../src/renderer/lib/chat/session-status";

describe("deriveSessionListStatus", () => {
  it("prioritizes archived over everything else", () => {
    expect(
      deriveSessionListStatus({
        archivedRow: true,
        isStreaming: true,
        isUnread: true,
      }).kind,
    ).toBe("archived");
  });

  it("prioritizes waiting over running and unread", () => {
    expect(
      deriveSessionListStatus({
        isWaitingPermission: true,
        isStreaming: true,
        isUnread: true,
      }).kind,
    ).toBe("waiting");
  });

  it("prioritizes streaming over unread", () => {
    expect(
      deriveSessionListStatus({
        isStreaming: true,
        isUnread: true,
      }).kind,
    ).toBe("running-stream");
  });

  it("shows terminal running when not streaming", () => {
    expect(
      deriveSessionListStatus({
        isAiTerminalRunning: true,
        isUnread: true,
      }).kind,
    ).toBe("running-terminal");
  });

  it("shows unread only when not active", () => {
    expect(
      deriveSessionListStatus({
        isUnread: true,
        isActive: false,
      }).kind,
    ).toBe("unread");

    expect(
      deriveSessionListStatus({
        isUnread: true,
        isActive: true,
      }).kind,
    ).toBe("read");
  });

  it("defaults to read", () => {
    expect(deriveSessionListStatus({}).kind).toBe("read");
    expect(deriveSessionListStatus({}).showStatusBadge).toBe(false);
  });

  it("sets showStatusBadge for non-read actionable states", () => {
    expect(deriveSessionListStatus({ isUnread: true }).showStatusBadge).toBe(true);
    expect(deriveSessionListStatus({ isStreaming: true }).showStatusBadge).toBe(true);
    expect(deriveSessionListStatus({}).showStatusBadge).toBe(false);
  });
});

describe("matchesSessionStatusFilter", () => {
  it("lets every kind through when the filter is all", () => {
    expect(matchesSessionStatusFilter("waiting", "all")).toBe(true);
    expect(matchesSessionStatusFilter("read", "all")).toBe(true);
    expect(matchesSessionStatusFilter("archived", "all")).toBe(true);
  });

  it("treats stream and terminal as running", () => {
    expect(matchesSessionStatusFilter("running-stream", "running")).toBe(true);
    expect(matchesSessionStatusFilter("running-terminal", "running")).toBe(true);
    expect(matchesSessionStatusFilter("waiting", "running")).toBe(false);
  });

  it("matches waiting, unread, and read exactly", () => {
    expect(matchesSessionStatusFilter("waiting", "waiting")).toBe(true);
    expect(matchesSessionStatusFilter("unread", "unread")).toBe(true);
    expect(matchesSessionStatusFilter("read", "read")).toBe(true);
    expect(matchesSessionStatusFilter("unread", "read")).toBe(false);
  });
});

describe("isActiveSessionFromChatState", () => {
  const tabs = [
    { id: "tab-a", sessionId: "sess-a", conversation: { conversationId: "sess-a" } },
    { id: "tab-b", sessionId: "sess-b", conversation: { conversationId: "conv-b" } },
  ];

  it("matches the focused tab by id, sessionId, or conversationId", () => {
    const chat = { activeTabId: "tab-b", sessionId: "sess-b", tabs };
    expect(isActiveSessionFromChatState("tab-b", chat)).toBe(true);
    expect(isActiveSessionFromChatState("sess-b", chat)).toBe(true);
    expect(isActiveSessionFromChatState("conv-b", chat)).toBe(true);
    expect(isActiveSessionFromChatState("sess-a", chat)).toBe(false);
  });
});

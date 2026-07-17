import { describe, expect, it } from "vitest";
import { shouldShowChatOpenTabs } from "../../src/renderer/components/layout/content-top-bar/chat-open-tabs";
import {
  isDisposableEmptyChatTab,
  pruneDisposableEmptyChatTabs,
} from "../../src/renderer/lib/chat/session-title";

describe("shouldShowChatOpenTabs", () => {
  it("hides the strip for a single open tab", () => {
    expect(shouldShowChatOpenTabs(0)).toBe(false);
    expect(shouldShowChatOpenTabs(1)).toBe(false);
  });

  it("shows the strip when two or more tabs are open", () => {
    expect(shouldShowChatOpenTabs(2)).toBe(true);
    expect(shouldShowChatOpenTabs(5)).toBe(true);
  });
});

describe("isDisposableEmptyChatTab", () => {
  const blank = {
    sessionId: null as string | null,
    isStreaming: false,
    messages: [] as unknown[],
    streamingMessage: null,
    draft: { input: "" },
  };

  it("treats a blank New Chat as disposable", () => {
    expect(isDisposableEmptyChatTab(blank)).toBe(true);
  });

  it("keeps tabs with session, draft, or messages", () => {
    expect(isDisposableEmptyChatTab({ ...blank, sessionId: "ses_1" })).toBe(false);
    expect(isDisposableEmptyChatTab({ ...blank, draft: { input: "hello" } })).toBe(false);
    expect(isDisposableEmptyChatTab({ ...blank, messages: [{ type: "user" }] })).toBe(false);
    expect(isDisposableEmptyChatTab({ ...blank, isStreaming: true })).toBe(false);
  });

  it("prunes disposable empties but keeps the target id", () => {
    const tabs = [
      { id: "a", ...blank },
      { id: "b", ...blank, sessionId: "ses_b", messages: [{ type: "user" }] },
      { id: "c", ...blank },
    ];
    expect(pruneDisposableEmptyChatTabs(tabs, "b").map((t) => t.id)).toEqual(["b"]);
    expect(pruneDisposableEmptyChatTabs(tabs).map((t) => t.id)).toEqual(["b"]);
  });
});

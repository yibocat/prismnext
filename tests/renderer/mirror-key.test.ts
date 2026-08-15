import { beforeEach, describe, expect, it } from "vitest";
import { resolveAiMirrorKey } from "../../src/renderer/lib/terminal/mirror-key";
import { useChatStore } from "@/stores/chat-store";

describe("resolveAiMirrorKey", () => {
  beforeEach(() => {
    useChatStore.setState({ tabs: [] } as never);
  });

  it("falls back to chatTabId when the session is unbound", () => {
    expect(resolveAiMirrorKey("chat-1")).toBe("chat-1");
  });

  it("uses the bound OpenCode sessionId", () => {
    useChatStore.setState({
      tabs: [{ id: "chat-1", sessionId: "sess-abc" }],
    } as never);
    expect(resolveAiMirrorKey("chat-1")).toBe("sess-abc");
  });
});
